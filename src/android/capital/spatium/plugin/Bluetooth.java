package capital.spatium.plugin;

import java.util.Set;
import java.util.UUID;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PluginResult;
import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaInterface;
import org.apache.cordova.CordovaWebView;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONException;

import android.Manifest;
import android.content.Context;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;

import static android.bluetooth.BluetoothAdapter.ACTION_DISCOVERY_FINISHED;
import static android.bluetooth.BluetoothAdapter.ACTION_DISCOVERY_STARTED;
import static android.bluetooth.BluetoothAdapter.ACTION_SCAN_MODE_CHANGED;
import static android.bluetooth.BluetoothAdapter.ACTION_STATE_CHANGED;
import static android.bluetooth.BluetoothAdapter.EXTRA_SCAN_MODE;
import static android.bluetooth.BluetoothAdapter.EXTRA_STATE;
import static android.bluetooth.BluetoothAdapter.SCAN_MODE_CONNECTABLE_DISCOVERABLE;

public class Bluetooth extends CordovaPlugin {
  private BluetoothAdapter mBluetoothAdapter;

  private CallbackContext mStateCallback = null;
  private CallbackContext mDiscoveredCallback = null;
  private CallbackContext mDiscoveryCallback = null;
  private CallbackContext mDiscoverableCallback = null;
  private CallbackContext mConnectedCallback = null;

  private CallbackContext mMessageCallback = null;

  private BluetoothServerSocket mBluetoothServerSocket = null;
  private BluetoothSocket       mBluetoothSocket = null;

  private BufferedReader mBufferedReader = null;
  private PrintWriter mPrintWriter = null;

  private boolean mListening = false;
  private boolean mReading = false;

  private static final int REQUEST_PERMISSION_BT = 4;

  private BroadcastReceiver mDiscoverableReceiver = null;
  private BroadcastReceiver mDiscoveryReceiver = null;
  private BroadcastReceiver mDiscoveredReceiver = null;
  private BroadcastReceiver mStateReceiver = null;

  @Override
  public void initialize(CordovaInterface cordova, CordovaWebView webView) {
    super.initialize(cordova, webView);

    mBluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
  }

  @Override
  public void onDestroy() {
    if (this.mDiscoveryReceiver != null) {
      try {
        webView.getContext().unregisterReceiver(this.mDiscoveryReceiver);
        this.mDiscoveryReceiver = null;
      } catch (Exception ignored) { }
    }
    if (this.mDiscoveredReceiver != null) {
      try {
        webView.getContext().unregisterReceiver(this.mDiscoveredReceiver);
        this.mDiscoveredReceiver = null;
      } catch (Exception ignored) { }
    }
    if (this.mDiscoverableReceiver != null) {
      try {
        webView.getContext().unregisterReceiver(this.mDiscoverableReceiver);
        this.mDiscoverableReceiver = null;
      } catch (Exception ignored) { }
    }
  }

  @Override
  public boolean execute(String action, JSONArray args, final CallbackContext callbackContext) throws JSONException {
    if ("getSupported".equals(action)) {
      getSupported(callbackContext);
      return true;
    } else if ("getState".equals(action)) {
      getState(callbackContext);
      return true;
    } else if ("getDiscoverable".equals(action)) {
      getDiscoverable(callbackContext);
      return true;
    } else if ("getListening".equals(action)) {
      getListening(callbackContext);
      return true;
    } else if ("getConnected".equals(action)) {
      getConnected(callbackContext);
      return true;
    } else if ("getReading".equals(action)) {
      getReading(callbackContext);
      return true;
    } else if ("enable".equals(action)) {
      enable(callbackContext);
      return true;
    } else if ("listPairedDevices".equals(action)) {
      listPairedDevices(callbackContext);
      return true;
    } else if ("startDiscovery".equals(action)) {
      startDiscovery(callbackContext);
      return true;
    } else if ("cancelDiscovery".equals(action)) {
      cancelDiscovery(callbackContext);
      return true;
    } else if ("enableDiscovery".equals(action)) {
      enableDiscovery(callbackContext);
      return true;
    } else if ("startListening".equals(action)) {
      startListening(callbackContext);
      return true;
    } else if ("stopListening".equals(action)) {
      stopListening(callbackContext);
      return true;
    } else if ("setConnectedCallback".equals(action)) {
      setConnectedCallback(callbackContext);
      return true;
    } else if ("setDiscoverableCallback".equals(action)) {
      setDiscoverableCallback(callbackContext);
      return true;
    } else if ("setDiscoveredCallback".equals(action)) {
      setDiscoveredCallback(callbackContext);
      return true;
    } else if ("setDiscoveryCallback".equals(action)) {
      setDiscoveryCallback(callbackContext);
      return true;
    } else if ("setMessageCallback".equals(action)) {
      setMessageCallback(callbackContext);
      return true;
    } else if ("setStateCallback".equals(action)) {
      setStateCallback(callbackContext);
      return true;
    } else if ("connect".equals(action)) {
      String device;
      String address;
      try {
        device = args.getJSONObject(0).getString("name");
        address = args.getJSONObject(0).getString("address");
        connect(device,address,callbackContext);
      } catch (Exception e) {
        callbackContext.error("Invalid arguments");
      }
      return true;
    } else if ("disconnect".equals(action)) {
      disconnect(callbackContext);
      return true;
    } else if ("startReading".equals(action)) {
      startReading(callbackContext);
      return true;
    } else if ("stopReading".equals(action)) {
      stopReading(callbackContext);
      return true;
    } else if ("write".equals(action)) {
      try {
        String data = args.getString(0);
        write(data, callbackContext);
      } catch (Exception e) {
        callbackContext.error("Invalid arguments");
      }
      return true;
    }

    return false;
  }

  private void getSupported(final CallbackContext callbackContext) {
    PluginResult result = new PluginResult(PluginResult.Status.OK, mBluetoothAdapter != null);
    callbackContext.sendPluginResult(result);
  }

  private void getState(final CallbackContext callbackContext) {
    if(mBluetoothAdapter == null) {
      callbackContext.error("Bluetooth is not supported");
      return;
    }

    PluginResult result = new PluginResult(PluginResult.Status.OK, mBluetoothAdapter.getState());
    callbackContext.sendPluginResult(result);
  }

  private void getDiscoverable(final CallbackContext callbackContext) {
      if(mBluetoothAdapter == null) {
        callbackContext.error("Bluetooth is not supported");
        return;
      }

      PluginResult result = new PluginResult(PluginResult.Status.OK, mBluetoothAdapter.getScanMode() == SCAN_MODE_CONNECTABLE_DISCOVERABLE);
      callbackContext.sendPluginResult(result);
    }

  private void setStateCallback(CallbackContext callbackContext) {
    mStateCallback = callbackContext;
    if(mStateReceiver == null) {
      mStateReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
          String action = intent.getAction();
          if (ACTION_STATE_CHANGED.equals(action)) {
            int state = intent.getIntExtra(EXTRA_STATE, -1);
            if(mStateCallback != null) {
              PluginResult result = new PluginResult(PluginResult.Status.OK, state);
              result.setKeepCallback(true);
              mStateCallback.sendPluginResult(result);
            }
          }
        }
      };
      webView.getContext().registerReceiver(mStateReceiver, new IntentFilter(ACTION_STATE_CHANGED));
    }
  }

  private void setDiscoveryCallback(CallbackContext callbackContext) {
    mDiscoveryCallback = callbackContext;
    if(mDiscoveryReceiver == null) {
      mDiscoveryReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
          String action = intent.getAction();
          if (ACTION_DISCOVERY_STARTED.equals(action)) {
            if(mDiscoveryCallback != null) {
              PluginResult result = new PluginResult(PluginResult.Status.OK, true);
              result.setKeepCallback(true);
              mDiscoveryCallback.sendPluginResult(result);
            }
          } else if (ACTION_DISCOVERY_FINISHED.equals(action)) {
            if(mDiscoveryCallback != null) {
              PluginResult result = new PluginResult(PluginResult.Status.OK, false);
              result.setKeepCallback(true);
              mDiscoveryCallback.sendPluginResult(result);
            }
          }
        }
      };
      IntentFilter filter = new IntentFilter();
      filter.addAction(ACTION_DISCOVERY_STARTED);
      filter.addAction(ACTION_DISCOVERY_FINISHED);
      webView.getContext().registerReceiver(mDiscoveryReceiver, filter);
    }
  }

  private void setDiscoverableCallback(CallbackContext callbackContext) {
    mDiscoverableCallback = callbackContext;
    if(mDiscoverableReceiver == null) {
      mDiscoverableReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
          String action = intent.getAction();
          if (ACTION_SCAN_MODE_CHANGED.equals(action)) {
            int state = intent.getIntExtra(EXTRA_SCAN_MODE, -1);
            if(mDiscoverableCallback != null) {
              PluginResult result = new PluginResult(PluginResult.Status.OK, state == SCAN_MODE_CONNECTABLE_DISCOVERABLE);
              result.setKeepCallback(true);
              mDiscoverableCallback.sendPluginResult(result);
            }
          }
        }
      };
      IntentFilter filter = new IntentFilter();
      filter.addAction(ACTION_SCAN_MODE_CHANGED);
      webView.getContext().registerReceiver(mDiscoverableReceiver, filter);
    }
  }

  private void setDiscoveredCallback(CallbackContext callbackContext) {
    mDiscoveredCallback = callbackContext;
    if(mDiscoveredReceiver == null) {
      mDiscoveredReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
          String action = intent.getAction();
          if (BluetoothDevice.ACTION_FOUND.equals(action)) {
            BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
            if (mDiscoveredCallback != null) {
              try {
                JSONObject item = new JSONObject();
                item.put("name", device.getName());
                item.put("address", device.getAddress());

                PluginResult result = new PluginResult(PluginResult.Status.OK, item);
                result.setKeepCallback(true);
                mDiscoveredCallback.sendPluginResult(result);
              } catch (Exception ignored) { }
            }
          }
        }
      };
      IntentFilter filter = new IntentFilter();
      filter.addAction(BluetoothDevice.ACTION_FOUND);
      webView.getContext().registerReceiver(mDiscoveredReceiver, filter);
    }
  }

  private void setMessageCallback(CallbackContext callbackContext) {
    mMessageCallback = callbackContext;
  }

  private void setConnectedCallback(CallbackContext callbackContext) {
    mConnectedCallback = callbackContext;
  }

  private void startDiscovery(final CallbackContext callbackContext) {
    if(mBluetoothAdapter == null || !mBluetoothAdapter.isEnabled()) {
      callbackContext.error("Bluetooth is not enabled");
      return;
    }

    try {
      if(!cordova.hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) {
        cordova.requestPermission(this, REQUEST_PERMISSION_BT, Manifest.permission.ACCESS_COARSE_LOCATION);
      } else {
        mBluetoothAdapter.startDiscovery();
      }
      callbackContext.success();
    } catch (Exception e) {
      callbackContext.error("Failed to start discovery");
    }
  }

  private void cancelDiscovery(final CallbackContext callbackContext) {
    try {
      mBluetoothAdapter.cancelDiscovery();
      callbackContext.success();
    } catch (Exception ignored) {
      callbackContext.error("Failed to cancel discovery");
    }
  }

  private void enableDiscovery(final CallbackContext callbackContext) {
    try {
      cordova.getActivity().startActivity(new Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE));
      callbackContext.success();
    } catch (Exception ignored) {
      callbackContext.error("Failed to start activity");
    }
  }

  private void listPairedDevices(final CallbackContext callbackContext) {
    if(mBluetoothAdapter == null || !mBluetoothAdapter.isEnabled()) {
      callbackContext.error("Bluetooth is not enabled");
      return;
    }

    JSONArray data = new JSONArray();
    Set<BluetoothDevice> devices = mBluetoothAdapter.getBondedDevices();
    for(BluetoothDevice device : devices) {
      try {
        JSONObject item = new JSONObject();
        item.put("name", device.getName());
        item.put("address", device.getAddress());
        data.put(item);
      } catch (Exception ignored) { }
    }

    PluginResult result = new PluginResult(PluginResult.Status.OK, data);
    callbackContext.sendPluginResult(result);
  }

  private void startListening(final CallbackContext callbackContext) {
    if(mBluetoothAdapter == null || !mBluetoothAdapter.isEnabled()) {
      callbackContext.error("Bluetooth is not enabled");
      return;
    }

    if(mBluetoothSocket != null) {
      callbackContext.error("Cannot listen while already connected");
      return;
    }

    cordova.getThreadPool().execute(new Runnable() {
      public void run() {
        try {
          mBluetoothServerSocket = mBluetoothAdapter.listenUsingRfcommWithServiceRecord("Spatium wallet", UUID.fromString("995f40e0-ce68-4d24-8f68-f49d2b9d661f"));

          mListening = true;
          while (mBluetoothSocket == null && mListening) {
            try {
              BluetoothSocket socket = mBluetoothServerSocket.accept(500);
              if(mBluetoothSocket == null) {
                mBufferedReader = new BufferedReader(new InputStreamReader(socket.getInputStream(), "UTF-8"));
                mPrintWriter = new PrintWriter(new OutputStreamWriter(socket.getOutputStream(), "UTF-8"), true);
                mBluetoothSocket = socket;
              } else {
                socket.close();
              }
            } catch (Exception ignored) {}
          }

          if(mBluetoothSocket != null && mConnectedCallback != null) {
            BluetoothDevice device = mBluetoothSocket.getRemoteDevice();

            JSONObject item = new JSONObject();
            item.put("name", device.getName());
            item.put("address", device.getAddress());

            PluginResult result = new PluginResult(PluginResult.Status.OK, item);
            result.setKeepCallback(true);
            mConnectedCallback.sendPluginResult(result);
          }
        } catch (Exception e) {
          callbackContext.error("Listening failed");
        } finally {
          try {
            mBluetoothServerSocket.close();
          } catch (Exception ignored) {}
          mBluetoothServerSocket = null;
          mListening = false;
        }
      }
    });

    callbackContext.success();
  }

  private void stopListening(final CallbackContext callbackContext) {
    if(!mListening) {
      callbackContext.error("Not listening");
      return;
    }

    mListening = false;
    callbackContext.success();
  }

  private void getListening(final CallbackContext callbackContext) {
    PluginResult result = new PluginResult(PluginResult.Status.OK, mListening);
    callbackContext.sendPluginResult(result);
  }

  private void connect(String device, String address, final CallbackContext callbackContext) {
    if(mBluetoothAdapter == null || !mBluetoothAdapter.isEnabled()) {
      callbackContext.error("Bluetooth is not enabled");
      return;
    }

    if(mBluetoothSocket != null) {
      callbackContext.error("Already connected");
      return;
    }

    final BluetoothDevice targetDevice = mBluetoothAdapter.getRemoteDevice(address);

    if(targetDevice == null) {
      callbackContext.error("Failed to find the device");
      return;
    }

    cordova.getThreadPool().execute(new Runnable() {
      public void run() {
        try {
          BluetoothSocket clientSocket = targetDevice.createRfcommSocketToServiceRecord(UUID.fromString("995f40e0-ce68-4d24-8f68-f49d2b9d661f"));
          clientSocket.connect();

          if(mBluetoothSocket == null) {
            mBufferedReader = new BufferedReader(new InputStreamReader(clientSocket.getInputStream(), "UTF-8"));
            mPrintWriter = new PrintWriter(new OutputStreamWriter(clientSocket.getOutputStream(), "UTF-8"), true);
            mBluetoothSocket = clientSocket;

            JSONObject item = new JSONObject();
            item.put("name", targetDevice.getName());
            item.put("address", targetDevice.getAddress());

            PluginResult result = new PluginResult(PluginResult.Status.OK, item);
            result.setKeepCallback(true);
            mConnectedCallback.sendPluginResult(result);

            callbackContext.success();
          } else {
            callbackContext.error("Failed to conect: interrupted");
            clientSocket.close();
          }
        } catch (Exception e) {
          callbackContext.error("Failed to conect to remote socket");
        }
      }
    });
  }

  private void disconnect(final CallbackContext callbackContext) {
    if(mBluetoothSocket == null) {
      callbackContext.error("Not connected");
      return;
    }

    try {
      mBluetoothSocket.close();
    } catch (Exception e) {
      callbackContext.error("Error closing client socket");
    }
    mBluetoothSocket = null;
    callbackContext.success();
  }

  private void getConnected(CallbackContext callbackContext) {
    PluginResult result = new PluginResult(PluginResult.Status.OK, mBluetoothSocket != null);
    callbackContext.sendPluginResult(result);
  }

  private void startReading(final CallbackContext callbackContext) {
    if(mBluetoothSocket == null) {
      callbackContext.error("Not connected");
      return;
    }

    cordova.getThreadPool().execute(new Runnable() {
      public void run() {
        try {
          mReading = true;

          while (mReading) {
            String string = mBufferedReader.readLine();

            if (mMessageCallback != null) {
              PluginResult result = new PluginResult(PluginResult.Status.OK, string);
              result.setKeepCallback(true);
              mMessageCallback.sendPluginResult(result);
            }
          }
        } catch (Exception e) {
          try {
            mBluetoothSocket.close();
          } catch (Exception ignored) {}
          mBluetoothSocket = null;
          if(mConnectedCallback != null) {
            PluginResult result = new PluginResult(PluginResult.Status.ERROR);
            result.setKeepCallback(true);
            mConnectedCallback.sendPluginResult(result);
          }
        } finally {
          mReading = false;
        }
      }
    });

    callbackContext.success();
  }

  private void getReading(final CallbackContext callbackContext) {
    PluginResult result = new PluginResult(PluginResult.Status.OK, mReading);
    callbackContext.sendPluginResult(result);
  }

  private void stopReading(final CallbackContext callbackContext) {
    if(!mReading) {
      callbackContext.error("Not reading");
      return;
    }

    mReading = false;
    callbackContext.success();
  }

  private void write(String data, final CallbackContext callbackContext) {
    if(mBluetoothSocket == null) {
      callbackContext.error("Not connected");
      return;
    }

    try {
	    mPrintWriter.println(data);
    } catch (Exception e) {
      callbackContext.error("Disconnected");
      return;
    }

    callbackContext.success();
  }

  private void enable(final CallbackContext callbackContext) {
    if(mBluetoothAdapter == null) {
      callbackContext.error("Bluetooth is not supported");
      return;
    }

    cordova.getActivity().startActivity(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE));
    callbackContext.success();
  }

  @Override
  public void onRequestPermissionResult(int requestCode, String[] permissions, int[] grantResults) throws JSONException {
    for(int r:grantResults) {
      if(r == PackageManager.PERMISSION_DENIED) {
        return;
      }
    }
    if(requestCode == REQUEST_PERMISSION_BT) {
      mBluetoothAdapter.startDiscovery();
    }
  }
}
