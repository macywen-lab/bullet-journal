package tw.notes.phonesync;

import android.Manifest;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.ContentUris;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract.Calendars;
import android.provider.CalendarContract.Instances;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

final class CalendarSync {
    static final ExecutorService WORK = Executors.newSingleThreadExecutor();
    static final String TOKEN = "token", CALENDARS = "calendars", STATUS = "status";
    private static final int JOB_ID = 2160;
    private static final ZoneId TAIWAN = ZoneId.of("Asia/Taipei");
    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("HH:mm");
    private static final String ENDPOINT = "https://bujo-phone-calendar-sync.workspace-926599.chatgpt.site/v1/calendar";

    static final class Source {
        final String id, name;
        final CalendarAccount account;

        Source(String id, String name, CalendarAccount account) {
            this.id = id;
            this.name = name;
            this.account = account;
        }
    }

    static SharedPreferences preferences(Context ctx) {
        return ctx.getSharedPreferences("private_calendar_pair", Context.MODE_PRIVATE);
    }

    static boolean hasAccess(Context context) {
        return context.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED;
    }

    static ArrayList<Source> sources(Context ctx) throws IOException {
        ArrayList<Source> list = new ArrayList<>();
        String[] columns = { Calendars._ID, Calendars.CALENDAR_DISPLAY_NAME, Calendars.ACCOUNT_TYPE, Calendars.ACCOUNT_NAME };
        try (Cursor rows = ctx.getContentResolver().query(Calendars.CONTENT_URI, columns, null, null,
                 Calendars.CALENDAR_DISPLAY_NAME + " ASC")) {
            if (rows == null) throw new IOException("手機暫時無法提供行事曆清單。");
            while (rows.moveToNext()) {
                String name = cleaned(rows.getString(1), 120, "未命名行事曆");
                list.add(new Source(rows.getString(0), name, new CalendarAccount(rows.getString(2), rows.getString(3))));
            }
        }
        return list;
    }

    static boolean schedule(Context ctx) {
        JobScheduler scheduler = ctx.getSystemService(JobScheduler.class);
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(ctx, CalendarJob.class))
            .setPeriodic(30L * 60L * 1000L)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPersisted(true).build();
        return scheduler.schedule(job) == JobScheduler.RESULT_SUCCESS;
    }

    static void stop(Context ctx) {
        ctx.getSystemService(JobScheduler.class).cancel(JOB_ID);
        preferences(ctx).edit().clear().apply();
    }

    static String sync(Context ctx) throws Exception {
        if (!hasAccess(ctx)) throw new IOException("請在手機開啟行事曆讀取權限。");
        SharedPreferences state = preferences(ctx);
        String token = state.getString(TOKEN, "");
        Set<String> selected = new LinkedHashSet<>(state.getStringSet(CALENDARS, java.util.Collections.emptySet()));
        if (token.isEmpty() || selected.isEmpty()) throw new IOException("請先輸入配對碼並勾選行事曆。");

        JSONArray records = new JSONArray();
        ArrayList<Source> available = sources(ctx);
        LocalDate today = LocalDate.now(TAIWAN);
        LocalDate from = today.minusDays(30), through = today.plusDays(365);
        long start = from.minusDays(1).atStartOfDay(TAIWAN).toInstant().toEpochMilli();
        long finish = through.plusDays(2).atStartOfDay(TAIWAN).toInstant().toEpochMilli();
        Uri.Builder builder = Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(builder, start);
        ContentUris.appendId(builder, finish);
        Uri uri = builder.build();
        Set<String> instances = new LinkedHashSet<>();

        Map<CalendarAccount, JSONArray> accountGroups = new LinkedHashMap<>();
        int sourceCount = 0;
        for (Source source : available) {
            if (!selected.contains(source.id)) continue;
            sourceCount++;
            accountGroups.computeIfAbsent(source.account, account -> new JSONArray()).put(source.name);
            readSource(ctx, source, uri, from, through, records, instances);
        }
        if (sourceCount != selected.size()) {
            throw new IOException("有已選行事曆暫時無法讀取。請重新勾選後再同步。");
        }
        if (!token.equals(state.getString(TOKEN, "")) || !selected.equals(state.getStringSet(CALENDARS, java.util.Collections.emptySet()))) {
            throw new IOException("配對或勾選的行事曆已變更，請重新同步。");
        }

        JSONArray accounts = new JSONArray();
        for (Map.Entry<CalendarAccount, JSONArray> group : accountGroups.entrySet()) {
            accounts.put(new JSONObject().put("label", cleaned(group.getKey().label(), 120, "其他帳號"))
                .put("calendars", group.getValue()));
        }
        JSONObject payload = new JSONObject().put("events", records).put("sourceCount", sourceCount).put("accounts", accounts);
        upload(token, payload);
        return "已同步 " + sourceCount + " 個行事曆、" + records.length() + " 筆行程。";
    }

    private static void readSource(Context ctx, Source source, Uri uri, LocalDate from, LocalDate through,
                                   JSONArray records, Set<String> instances) throws Exception {
        String[] columns = { Instances.EVENT_ID, Instances.BEGIN, Instances.TITLE, Instances.ALL_DAY };
        try (Cursor rows = ctx.getContentResolver().query(uri, columns, Instances.CALENDAR_ID + " = ? AND " +
                 "(" + Instances.STATUS + " IS NULL OR " + Instances.STATUS + " != ?)", new String[]{source.id, "2"}, Instances.BEGIN + " ASC")) {
            if (rows == null) throw new IOException("手機暫時無法讀取選取的行事曆。");
            while (rows.moveToNext()) {
                long begins = rows.getLong(1);
                Instant time = Instant.ofEpochMilli(begins);
                boolean allDay = rows.getInt(3) == 1;
                LocalDate date = time.atZone(allDay ? ZoneOffset.UTC : TAIWAN).toLocalDate();
                if (date.isBefore(from) || date.isAfter(through)) continue;
                String id = source.id + ":" + rows.getLong(0) + ":" + begins;
                if (!instances.add(id)) continue;
                if (records.length() >= 4000) throw new IOException("行程超過 4,000 筆，請減少勾選的行事曆。");
                records.put(new JSONObject().put("id", id)
                    .put("date", date.toString())
                    .put("time", allDay ? "" : CLOCK.format(time.atZone(TAIWAN)))
                    .put("title", cleaned(rows.getString(2), 160, "未命名行程"))
                    .put("source", source.name));
            }
        }
    }

    private static String cleaned(String value, int max, String fallback) {
        String text = value == null ? "" : value.trim();
        if (text.isEmpty()) return fallback;
        if (text.length() <= max) return text;
        int last = max - 1;
        if (Character.isHighSurrogate(text.charAt(last - 1))) last--;
        return text.substring(0, last) + "…";
    }

    private static void upload(String token, JSONObject payload) throws IOException {
        byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > 1_400_000) throw new IOException("同步資料過多，請減少勾選的行事曆。");
        HttpURLConnection connection = (HttpURLConnection) new URL(ENDPOINT).openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(25_000);
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (java.io.OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }
            int status = connection.getResponseCode();
            if (status == 401) throw new IOException("配對碼已無效。請在子彈筆記取得新配對碼。");
            if (status != 200) throw new IOException("同步服務暫時無法接收資料，請稍後重試。");
        } finally {
            connection.disconnect();
        }
    }
}
