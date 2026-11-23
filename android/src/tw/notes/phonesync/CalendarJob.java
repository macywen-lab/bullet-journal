package tw.notes.phonesync;

import android.app.job.JobParameters;
import android.app.job.JobService;
import java.util.concurrent.Future;

public final class CalendarJob extends JobService {
    private Future<?> work;

    @Override public boolean onStartJob(JobParameters params) {
        work = CalendarSync.WORK.submit(() -> {
            String message;
            try {
                message = CalendarSync.sync(this);
            } catch (Exception failure) {
                message = failure instanceof java.io.IOException && failure.getMessage() != null
                    ? failure.getMessage() : "同步尚未完成，下次會再試。";
            }
            CalendarSync.preferences(this).edit().putString(CalendarSync.STATUS, message).apply();
            jobFinished(params, false);
        });
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) {
        if (work != null) work.cancel(true);
        return true;
    }
}
