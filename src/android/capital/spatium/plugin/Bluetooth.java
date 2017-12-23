package capital.spatium.plugin;

import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CallbackContext;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONException;
import android.content.Context;

public class Bluetooth extends CordovaPlugin {
	@Override
	public boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException {
		if ("getDeviceInfo".equals(action)) {
			getDeviceInfo(callbackContext);
			return true;
		}

		return false;
	}

	private void getDeviceInfo(CallbackContext callbackContext) {
		callbackContext.success("Dummy android bluetooth info");
	}
}
