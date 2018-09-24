package capital.spatium.plugin;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PluginResult;
import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaArgs;
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

  private Map<String, BluetoothSocket> bluetoothSockets = new HashMap<String, BluetoothSocket>();
  private Map<String, BluetoothServerSocket> bluetoothServerSockets = new HashMap<String, BluetoothServerSocket>();

  private CallbackContext mStateCallback = null;
  private CallbackContext mDiscoveredCallback = null;
  private CallbackContext mDiscoveryCallback = null;
  private CallbackContext mDiscoverableCallback = null;

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
  public boolean execute(String action, CordovaArgs args, final CallbackContext callbackContext) throws JSONException {
    if ("getSupported".equals(action)) {
      getSupported(callbackContext);
      return true;
    } else if ("getState".equals(action)) {
      getState(callbackContext);
      return true;
    } else if ("getDiscoverable".equals(action)) {
      getDiscoverable(callbackContext);
      return true;
    } else if ("requestEnable".equals(action)) {
      requestEnable(callbackContext);
      return true;
    } else if ("enable".equals(action)) {
      enable(callbackContext);
      return true;
    } else if ("disable".equals(action)) {
      disable(callbackContext);
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
    } else if ("stopListening".equals(action)) {
      stopServer(args, callbackContext);
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
    } else if ("setStateCallback".equals(action)) {
      setStateCallback(callbackContext);
      return true;
    } else if ("setSupportedCallback".equals(action)) {
      // We do not support tracking BT support on android yet
      return true;
    } else if ("open".equals(action)) {
      this.open(args, callbackContext);
      return true;
    }
    else if ("startServer".equals(action)) {
      this.startServer(args, callbackContext);
      return true;
    } else if ("disconnect".equals(action)) {
      disconnect(args, callbackContext);
      return true;
    } else if ("write".equals(action)) {
      try {
        write(args, callbackContext);
      } catch (Exception e) {
        callbackContext.error("Invalid arguments");
      }
      return true;
    }

    return false;
  }

  private void open(CordovaArgs args, CallbackContext callbackContext) throws JSONException {
    String socketKey = args.getString(0);
    String address = args.getString(1);
    this.connect(socketKey, address, callbackContext);
  }

  private void close(CordovaArgs args, CallbackContext callbackContext) throws JSONException {
    String socketKey = args.getString(0);

    try {
      BluetoothSocket socket = bluetoothSockets.get(socketKey);
      socket.close();
      bluetoothSockets.remove(socketKey);
      callbackContext.success();
    } catch (IOException e) {
      callbackContext.error(e.toString());
    }
  }

  private void setOptions(CordovaArgs args, CallbackContext callbackContext) throws JSONException {
  }

  private void startServer(CordovaArgs args, CallbackContext callbackContext) throws JSONException {
    String serverSocketKey = args.getString(0);

    if(mBluetoothAdapter == null || !mBluetoothAdapter.isEnabled()) {
      callbackContext.error("Bluetooth is not enabled");
      return;
    }

    if(bluetoothSockets.containsKey(serverSocketKey)) {
      callbackContext.error("Cannot listen while already connected");
      return;
    }

    if(bluetoothServerSockets.containsKey(serverSocketKey)) {
      callbackContext.error("Already listening");
      return;
    }

    cordova.getThreadPool().execute(new Runnable() {
      public void run() {
        try {
          BluetoothServerSocket mBluetoothServerSocket = mBluetoothAdapter.listenUsingRfcommWithServiceRecord("Spatium wallet", UUID.fromString("995f40e0-ce68-4d24-8f68-f49d2b9d661f"));
          bluetoothServerSockets.put(serverSocketKey, mBluetoothServerSocket);

          while(bluetoothServerSockets.containsKey(serverSocketKey)) {
            BluetoothSocket socket = mBluetoothServerSocket.accept();
            BluetoothSocket mBluetoothSocket = bluetoothSockets.get(serverSocketKey);

            String socketKey = UUID.randomUUID().toString();
            if (!bluetoothSockets.containsKey(socketKey)) {
              mBluetoothSocket = socket;
              bluetoothSockets.put(socketKey, socket);
            } else {
              socket.close();
            }

            if (mBluetoothSocket != null) {
              BluetoothDevice device = mBluetoothSocket.getRemoteDevice();


              JSONObject event = new JSONObject();
              event.put("type", "Connected");
              event.put("name", device.getName());
              event.put("address", device.getAddress());
              event.put("socketKey", socketKey);
              event.put("serverSocketKey", serverSocketKey);
              dispatchServerEvent(event);
              startReading(socketKey, callbackContext);
            }
          }
        } catch (Exception e) {
          try {
            JSONObject event = new JSONObject();
            event.put("type", "Stopped");
            event.put("serverSocketKey", serverSocketKey);
            dispatchServerEvent(event);
          } catch (Exception ignored) {}

          callbackContext.error("Listening failed");
        } finally {
          BluetoothServerSocket mBluetoothServerSocket = bluetoothServerSockets.get(serverSocketKey);
          if (bluetoothServerSockets.containsKey(serverSocketKey)) {
            try {
              mBluetoothServerSocket.close();
            } catch (Exception ignored) {}

            bluetoothServerSockets.remove(serverSocketKey);
          }
        }
      }
    });

    callbackContext.success();
  }

  private void stopServer(CordovaArgs args, final CallbackContext callbackContext) throws JSONException {
    String socketKey = args.getString(0);
    BluetoothServerSocket socket = bluetoothServerSockets.get(socketKey);

    if(!bluetoothServerSockets.containsKey(socketKey)) {
      callbackContext.error("Not listening");
      return;
    }

    try {
      socket.close();
    } catch (Exception ignored) {}

    bluetoothServerSockets.remove(socketKey);

    JSONObject event = new JSONObject();
    event.put("type", "Stopped");
    event.put("serverSocketKey", socketKey);
    dispatchServerEvent(event);
    callbackContext.success();
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

  private void connect(String socketKey, String address, final CallbackContext callbackContext) {
    if(mBluetoothAdapter == null || !mBluetoothAdapter.isEnabled()) {
      callbackContext.error("Bluetooth is not enabled");
      return;
    }

    if(this.bluetoothSockets.containsKey(socketKey)) {
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

          if(!bluetoothSockets.containsKey(socketKey)) {
            bluetoothSockets.put(socketKey, clientSocket);

            JSONObject event = new JSONObject();
            event.put("type", "Connected");
            event.put("name", targetDevice.getName());
            event.put("address", targetDevice.getAddress());
            event.put("socketKey", socketKey);
            dispatchEvent(event);
            startReading(socketKey, callbackContext);
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

  private void disconnect(CordovaArgs args, final CallbackContext callbackContext) throws JSONException {
    String socketKey = args.getString(0);
    BluetoothSocket mBluetoothSocket = bluetoothSockets.get(socketKey);

    if(!bluetoothSockets.containsKey(socketKey)) {
      callbackContext.error("Not connected");
      return;
    }

    try {
      mBluetoothSocket.close();
    } catch (Exception e) {
      callbackContext.error("Error closing client socket");
    }

    JSONObject event = new JSONObject();
    event.put("type", "Close");
    event.put("socketKey", socketKey);
    dispatchEvent(event);

    bluetoothSockets.remove(socketKey);
    callbackContext.success();
  }


  private void startReading(String socketKey, final CallbackContext callbackContext) {

    if(!this.bluetoothSockets.containsKey(socketKey)) {
      callbackContext.error("Not connected");
      return;
    }

    cordova.getThreadPool().execute(new Runnable() {
      public void run() {
        try {
          BluetoothSocket socket = bluetoothSockets.get(socketKey);
          BufferedReader mBufferedReader = new BufferedReader(new InputStreamReader(socket.getInputStream(), "UTF-8"));

          while (bluetoothSockets.containsKey(socketKey)) {
            String string = mBufferedReader.readLine();

            JSONObject event = new JSONObject();
            event.put("type", "DataReceived");
            event.put("data", string);
            event.put("socketKey", socketKey);
            dispatchEvent(event);
          }
        } catch (Exception e) {
          try {
            bluetoothSockets.get(socketKey).close();
          } catch (Exception ignored) {}

          bluetoothSockets.remove(socketKey);

          try {
            JSONObject event = new JSONObject();
            event.put("type", "Close");
            event.put("socketKey", socketKey);
            dispatchEvent(event);
          } catch (Exception ignored) {}

        }
      }
    });

    callbackContext.success();
  }

  private void write(CordovaArgs args, final CallbackContext callbackContext) throws JSONException {
    String socketKey = args.getString(0);
    JSONArray data = args.getJSONArray(1);

    byte[] dataBuffer = new byte[data.length()];
    for(int i = 0; i < dataBuffer.length; i++) {
      dataBuffer[i] = (byte) data.getInt(i);
    }

    BluetoothSocket socket = bluetoothSockets.get(socketKey);

    if(!this.bluetoothSockets.containsKey(socketKey)) {
      callbackContext.error("Not connected");
      return;
    }

    PrintWriter mPrintWriter = null;
    try {
      mPrintWriter = new PrintWriter(new OutputStreamWriter(socket.getOutputStream(), "UTF-8"), true);
    } catch (IOException e) {
      callbackContext.error("Not connected");
    }

    try {
        mPrintWriter.println(data);
        callbackContext.success();
    } catch (Exception e) {
      callbackContext.error("Disconnected");
      return;
    }

    callbackContext.success();
  }

  private void requestEnable(final CallbackContext callbackContext) {
    if(mBluetoothAdapter == null) {
      callbackContext.error("Bluetooth is not supported");
      return;
    }

    cordova.getActivity().startActivity(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE));
    callbackContext.success();
  }

  private void enable(final CallbackContext callbackContext) {
    if(mBluetoothAdapter == null) {
      callbackContext.error("Bluetooth is not supported");
      return;
    }

    mBluetoothAdapter.enable();
    callbackContext.success();
  }

  private void disable(final CallbackContext callbackContext) {
    if(mBluetoothAdapter == null) {
      callbackContext.error("Bluetooth is not supported");
      return;
    }

    mBluetoothAdapter.disable();
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

  private void dispatchEvent(final JSONObject jsonEventObject) {
    cordova.getActivity().runOnUiThread(new Runnable(){
      @Override
      public void run() {
        webView.loadUrl(String.format("javascript:cordova.plugins.bluetooth.BluetoothSocket.dispatchEvent(%s);", jsonEventObject.toString()));
      }
    });
  }

  private void dispatchServerEvent(final JSONObject jsonEventObject) {
    cordova.getActivity().runOnUiThread(new Runnable(){
      @Override
      public void run() {
        webView.loadUrl(String.format("javascript:cordova.plugins.bluetooth.BluetoothServerSocket.dispatchEvent(%s);", jsonEventObject.toString()));
      }
    });
  }
}
