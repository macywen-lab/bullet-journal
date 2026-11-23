package tw.notes.phonesync;

import java.util.Locale;
import java.util.Objects;

final class CalendarAccount {
    final String type;
    final String name;

    CalendarAccount(String type, String name) {
        this.type = type == null ? "" : type;
        this.name = name == null ? "" : name;
    }

    boolean isLocal() {
        return type.isEmpty() || "LOCAL".equalsIgnoreCase(type);
    }

    String label() {
        String provider = type.toLowerCase(Locale.ROOT);
        if (isLocal()) return "我的手機";
        if ("com.google".equals(provider)) return "Google";
        if (provider.contains("samsung") || provider.startsWith("com.osp.")) return "三星帳號";
        if (provider.contains("outlook") || provider.contains("microsoft")) return "Outlook";
        if (provider.contains("exchange")) return "Exchange";
        return type;
    }

    @Override public boolean equals(Object other) {
        if (!(other instanceof CalendarAccount)) return false;
        CalendarAccount account = (CalendarAccount) other;
        return type.equals(account.type) && name.equals(account.name);
    }

    @Override public int hashCode() {
        return Objects.hash(type, name);
    }
}
