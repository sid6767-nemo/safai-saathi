package in.safaisaathi.reporter;

import android.Manifest;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Answers the screens' requests for the camera and location one at a time.
 *
 * Capacitor's own client shares one callback between them, so when the report screen asks for both
 * at once on first launch, the location answer reaches the camera request a second time and the app
 * crashes. Here each request waits its turn. The same file is in both apps (reporter and picker).
 *
 * File choosers are refused: photos may only come from the live camera (see scripts/check.mjs).
 */
public class SafeChromeClient extends BridgeWebChromeClient {

    private static final String[] CAMERA = { Manifest.permission.CAMERA };
    private static final String[] LOCATION = {
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    };

    private static final class Ask {

        final String[] permissions;
        final Consumer<Map<String, Boolean>> done;

        Ask(String[] permissions, Consumer<Map<String, Boolean>> done) {
            this.permissions = permissions;
            this.done = done;
        }
    }

    private final Bridge bridge;
    private final ActivityResultLauncher<String[]> launcher;
    private final ArrayDeque<Ask> queue = new ArrayDeque<>();
    private Ask current;

    public SafeChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
        launcher = bridge.registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), (result) -> {
            Ask answered = current;
            current = null;
            if (answered != null) answered.done.accept(result);
            next();
        });
    }

    private boolean has(String permission) {
        return ContextCompat.checkSelfPermission(bridge.getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    private void ask(String[] permissions, Consumer<Map<String, Boolean>> done) {
        queue.add(new Ask(permissions, done));
        if (current == null) next();
    }

    private void next() {
        current = queue.poll();
        if (current != null) launcher.launch(current.permissions);
    }

    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        if (!Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
            request.deny(); // the screens never need the microphone or anything else
            return;
        }
        final String[] video = { PermissionRequest.RESOURCE_VIDEO_CAPTURE };
        if (has(Manifest.permission.CAMERA)) {
            request.grant(video);
            return;
        }
        ask(CAMERA, (result) -> {
            try {
                if (has(Manifest.permission.CAMERA)) request.grant(video);
                else request.deny();
            } catch (IllegalStateException alreadyAnswered) {
                // The screen gave up waiting (e.g. it navigated away); nothing left to answer.
            }
        });
    }

    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
        if (has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION)) {
            callback.invoke(origin, true, false);
            return;
        }
        // "Approximate" is still an answer; the 30 m proof check will say if it's too rough.
        ask(LOCATION, (result) ->
            callback.invoke(origin, has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION), false)
        );
    }

    @Override
    public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams params) {
        filePathCallback.onReceiveValue(null);
        return true;
    }
}
