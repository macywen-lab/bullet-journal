package tw.notes.phonesync;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

public final class MainActivity extends Activity {
    private final Map<String, CheckBox> sources = new LinkedHashMap<>();
    private final Set<CalendarAccount> expanded = new LinkedHashSet<>();
    private LinearLayout sourceList;
    private EditText pairingCode;
    private LinearLayout pairingControls;
    private TextView status;
    private Button sync;
    private Button stop;
    private Button inspect;
    private Button addAccount;
    private SharedPreferences saved;

    @Override public void onCreate(Bundle previous) {
        super.onCreate(previous);
        saved = CalendarSync.preferences(this);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(0xfff5faf8);
        scroll.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(20), dp(18), dp(20), dp(24));
        scroll.addView(page);
        setContentView(scroll);
        addText(page, "子彈筆記手機同步", 25);
        addText(page, "展開帳號，勾選要同步的行事曆。", 16);
        addAccount = button(page, "＋ 加入帳號", this::openAccountSettings);
        inspect = button(page, "讀取手機帳號與行事曆", this::requestCalendar);
        sourceList = new LinearLayout(this);
        sourceList.setOrientation(LinearLayout.VERTICAL);
        page.addView(sourceList);
        sync = button(page, "儲存選擇並立即同步", this::startSync);
        button(page, "返回子彈筆記", this::openJournal);
        button(page, "手機連線設定", () ->
            pairingControls.setVisibility(pairingControls.getVisibility() == View.GONE ? View.VISIBLE : View.GONE));
        pairingControls = new LinearLayout(this);
        pairingControls.setOrientation(LinearLayout.VERTICAL);
        page.addView(pairingControls);
        button(pairingControls, "開啟子彈筆記取得配對碼", this::openJournal);
        pairingCode = new EditText(this);
        pairingCode.setHint("貼上子彈筆記的手機配對碼");
        pairingCode.setSingleLine(true);
        pairingCode.setSaveEnabled(false);
        pairingCode.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        pairingControls.addView(pairingCode);
        pairingControls.setVisibility(View.GONE);
        stop = button(page, "在這支手機停止同步", () -> {
            CalendarSync.stop(this);
            pairingCode.setText("");
            status.setText("這支手機已停止同步。可回子彈筆記解除配對，以撤銷配對碼和刪除已同步的行程。");
        });
        status = addText(page, saved.getString(CalendarSync.STATUS, "請先讀取行事曆清單。"), 15);
        if (previous == null) handleCalendarLink(getIntent());
    }

    @Override protected void onResume() {
        super.onResume();
        if (sync.isEnabled() && CalendarSync.hasAccess(this)) showCalendars();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleCalendarLink(intent);
    }

    private void handleCalendarLink(Intent intent) {
        Uri uri = intent.getData();
        if (!Intent.ACTION_VIEW.equals(intent.getAction()) || uri == null ||
                !"bujo-phone-sync".equals(uri.getScheme()) || !"calendar".equals(uri.getAuthority())) return;
        if ("/add-account".equals(uri.getPath())) openAccountSettings();
        if ("/select".equals(uri.getPath()) && !CalendarSync.hasAccess(this)) requestCalendar();
    }

    private void openJournal() {
        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(
            "https://my-bullet-notebook.workspace-926599.chatgpt.site/?calendar=accounts")));
    }

    private void openAccountSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_ADD_ACCOUNT));
        } catch (ActivityNotFoundException | SecurityException unavailable) {
            try {
                startActivity(new Intent(Settings.ACTION_SYNC_SETTINGS));
            } catch (ActivityNotFoundException | SecurityException failure) {
                status.setText("請到手機設定的「帳號與備份」新增帳號，再回來重新整理。");
            }
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private TextView addText(LinearLayout parent, String text, int size) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(0xff16433a);
        view.setPadding(0, dp(8), 0, dp(8));
        parent.addView(view);
        return view;
    }

    private Button button(LinearLayout parent, String text, Runnable callback) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setOnClickListener(view -> callback.run());
        parent.addView(button);
        return button;
    }

    private void requestCalendar() {
        if (CalendarSync.hasAccess(this)) showCalendars();
        else requestPermissions(new String[]{Manifest.permission.READ_CALENDAR}, 1);
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request != 1) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) showCalendars();
        else status.setText("尚未授權。你也可以從手機設定開啟這個 App 的行事曆讀取權限。");
    }

    private void showCalendars() {
        Set<String> checked = new LinkedHashSet<>(saved.getStringSet(CalendarSync.CALENDARS,
            java.util.Collections.emptySet()));
        sources.forEach((id, option) -> {
            if (option.isChecked()) checked.add(id);
            else checked.remove(id);
        });

        try {
            Map<CalendarAccount, ArrayList<CalendarSync.Source>> accounts = new LinkedHashMap<>();
            for (CalendarSync.Source source : CalendarSync.sources(this)) {
                accounts.computeIfAbsent(source.account, account -> new ArrayList<>()).add(source);
            }
            ArrayList<CalendarAccount> ordered = new ArrayList<>(accounts.keySet());
            ordered.sort((a, b) -> Boolean.compare(b.isLocal(), a.isLocal()));
            sources.clear();
            sourceList.removeAllViews();
            inspect.setText("重新整理帳號與行事曆");
            for (CalendarAccount account : ordered) {
                addCalendarGroup(account, accounts.get(account), checked);
            }
            if (accounts.isEmpty()) addText(sourceList, "目前沒有可讀取的行事曆。新增帳號後，可重新整理清單。", 15);
        } catch (Exception failure) {
            status.setText("讀取行事曆失敗，請確認手機權限後再試。");
        }
    }

    private void addCalendarGroup(CalendarAccount account, ArrayList<CalendarSync.Source> entries,
                                  Set<String> checked) {
        Button heading = new Button(this);
        heading.setAllCaps(false);
        heading.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        heading.setMinHeight(dp(52));
        sourceList.addView(heading, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout calendars = new LinearLayout(this);
        calendars.setOrientation(LinearLayout.VERTICAL);
        calendars.setPadding(dp(14), 0, 0, dp(6));
        sourceList.addView(calendars);
        Runnable render = () -> {
            boolean open = expanded.contains(account);
            int count = 0;
            for (CalendarSync.Source entry : entries) {
                if (sources.get(entry.id).isChecked()) count++;
            }
            String name = account.label() + (account.isLocal() || account.name.isEmpty() ? "" : "\n" + account.name);
            heading.setText((open ? "▾ " : "▸ ") + name + " · " + count + "/" + entries.size());
            heading.setContentDescription((open ? "收合 " : "展開 ") + name + "，已選 " + count + " 個行事曆");
            calendars.setVisibility(open ? View.VISIBLE : View.GONE);
        };
        for (CalendarSync.Source entry : entries) {
            CheckBox option = new CheckBox(this);
            option.setText(entry.name);
            option.setChecked(checked.contains(entry.id));
            option.setOnCheckedChangeListener((button, selected) -> render.run());
            sources.put(entry.id, option);
            calendars.addView(option);
        }
        heading.setOnClickListener(view -> {
            if (!expanded.add(account)) expanded.remove(account);
            render.run();
        });
        render.run();
    }

    private void startSync() {
        Set<String> checked = new LinkedHashSet<>();
        for (Map.Entry<String, CheckBox> item : sources.entrySet()) {
            if (item.getValue().isChecked()) checked.add(item.getKey());
        }
        if (checked.isEmpty()) {
            status.setText("請至少勾選一個行事曆。");
            return;
        }
        String pasted = pairingCode.getText().toString().trim();
        String token = pasted.isEmpty() ? saved.getString(CalendarSync.TOKEN, "") : pasted;
        if (!token.matches("[0-9a-f]{64}")) {
            pairingControls.setVisibility(View.VISIBLE);
            status.setText("首次同步請先在子彈筆記的「手機連線設定」取得配對碼。");
            return;
        }
        saved.edit().putString(CalendarSync.TOKEN, token).putStringSet(CalendarSync.CALENDARS, checked).apply();
        pairingCode.setText("");
        pairingControls.setVisibility(View.GONE);
        sync.setEnabled(false);
        stop.setEnabled(false);
        inspect.setEnabled(false);
        addAccount.setEnabled(false);
        status.setText("正在同步選取的行事曆…");
        CalendarSync.WORK.submit(() -> {
            String result;
            try {
                result = CalendarSync.sync(getApplicationContext());
                if (!CalendarSync.schedule(getApplicationContext())) result += "\n背景排程未啟用，可回到此頁手動同步。";
            } catch (Exception failure) {
                result = failure instanceof java.io.IOException && failure.getMessage() != null
                    ? failure.getMessage() : "暫時無法同步，請確認網路連線後再試。";
            }
            final String message = result;
            saved.edit().putString(CalendarSync.STATUS, message).apply();
            runOnUiThread(() -> {
                status.setText(message);
                sync.setEnabled(true);
                stop.setEnabled(true);
                inspect.setEnabled(true);
                addAccount.setEnabled(true);
            });
        });
    }
}
