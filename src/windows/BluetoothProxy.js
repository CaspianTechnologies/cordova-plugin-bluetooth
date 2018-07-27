const SERVICE_UUID = "{995f40e0-ce68-4d24-8f68-f49d2b9d661f}";

const SDP_SERVICE_NAME_ATTRIBUTE_ID = 0x100;
const SDP_SERVICE_NAME_ATTRIBUTE_TYPE = (4 << 3) | 5;

const ANDROID_STATE_OFF = 0x0000000a;
const ANDROID_STATE_TURNING_ON = 0x0000000b;
const ANDROID_STATE_ON = 0x0000000c;
const ANDROID_STATE_TURNING_OFF = 0x0000000d;

const StateMap = {};
StateMap[Windows.Devices.Radios.RadioState.disabled] = ANDROID_STATE_OFF;
StateMap[Windows.Devices.Radios.RadioState.off] = ANDROID_STATE_OFF;
StateMap[Windows.Devices.Radios.RadioState.on] = ANDROID_STATE_ON;
StateMap[Windows.Devices.Radios.RadioState.unknown] = ANDROID_STATE_OFF;

const plugin = (() => {
  let _supported = false;
  let _state = false;
  let _discovering = false;
  let _reading = false;

  let _connectedDevice = null;

  let _supportedCallback = null;
  let _stateCallback = null;
  let _discoveringCallback = null;
  let _readingCallback = null;
  let _messageCallback = null;
  let _connectedDeviceCallback = null;
  let _discoveredCallback = null;

  return {
    // state control
    get supported() {
      return _supported;
    },
    set supported(value) {
      if (value === _supported) {
        return;
      }

      _supported = value;
      if (_supportedCallback) {
        _supportedCallback(_supported, { keepCallback: true });
      }
    },
    // state control
    get state() {
      return _state;
    },
    set state(value) {
      if (value === _state) {
        return;
      }

      _state = value;
      if (_stateCallback) {
        _stateCallback(_state, { keepCallback: true });
      }
    },
    // connected control
    get connectedDevice() {
      return _connectedDevice;
    },
    set connectedDevice(value) {
      if (value === _connectedDevice) {
        return;
      }

      _connectedDevice = value;
      if (_connectedDeviceCallback) {
        _connectedDeviceCallback(_connectedDevice, { keepCallback: true });
      }
    },
    // discovering control
    get discovering() {
      return _discovering;
    },
    set discovering(value) {
      if (value === _discovering) {
        return;
      }

      _discovering = value;
      if (_discoveringCallback) {
        _discoveringCallback(_discovering, { keepCallback: true });
      }
    },
    // reading control
    get reading() {
      return _reading;
    },
    set reading(value) {
      if (value === _reading) {
        return;
      }

      _reading = value;
      if (_readingCallback) {
        _readingCallback(_reading, { keepCallback: true });
      }
    },
    // device discovered
    discovered: (device) => {
      if (_discoveredCallback) {
        _discoveredCallback(device, { keepCallback: true });
      }
    },
    // message received
    message: (message) => {
      if (_messageCallback) {
        _messageCallback(message, { keepCallback: true });
      }
    },
    set supportedCallback(callback) {
      _supportedCallback = callback;
    },
    set stateCallback(callback) {
      _stateCallback = callback;
    },
    set discoveringCallback(callback) {
      _discoveringCallback = callback;
    },
    set readingCallback(callback) {
      _readingCallback = callback;
    },
    set messageCallback(callback) {
      _messageCallback = callback;
    },
    set connectedDeviceCallback(callback) {
      _connectedDeviceCallback = callback;
    },
    set discoveredCallback(callback) {
      _discoveredCallback = callback;
    },
    // uncontrolled data
    socket: null,
    service: null,
    writer: null,
    watcher: null,
    adapter: null
  }
})();

async function getBluetoothAdapterAsync() {
  const radios = await Windows.Devices.Radios.Radio.getRadiosAsync();
  const bluetoothAdapters = radios.filter(radio => {
    return radio.name.toLowerCase() === 'bluetooth';
  });

  return bluetoothAdapters.length > 0 ? bluetoothAdapters[0] : null;
}

function stateHandler(state) {
  console.log(state, plugin.adapter.state);
  plugin.state = StateMap[plugin.adapter.state];
}

async function refreshAdapterState() {
	const adapter = await getBluetoothAdapterAsync();

  if (adapter && !plugin.adapter) {
    plugin.adapter = adapter;
	plugin.supported = true;
    plugin.adapter.addEventListener('statechanged', stateHandler);
    plugin.state = StateMap[plugin.adapter.state];
  } else if (!adapter && plugin.adapter) {
    plugin.adapter.removeEventListener('statechanged', stateHandler);
    plugin.adapter = null;
	plugin.supported = false;
    plugin.state = ANDROID_STATE_OFF;
  }
}

refreshAdapterState().then(() => setInterval(refreshAdapterState, 1000));

function setupDiscoveryWatcher(discoveredCallback, stoppedCallback) {
  const watcher = new Windows.Devices.Enumeration.DeviceInformation.createWatcher(Windows.Devices.Bluetooth.BluetoothDevice.getDeviceSelectorFromPairingState(false), null);

  let deviceArray = [];

  watcher.addEventListener("added", devInfo => {
    discoveredCallback(devInfo);

    deviceArray.push(devInfo);
  });

  watcher.addEventListener("removed", devUpdate => {
    deviceArray = deviceArray.filter(devInfo => devInfo.id !== devUpdate.id );
  });

  watcher.addEventListener("updated", devUpdate => {
    deviceArray.filter(devInfo => devInfo.id === devUpdate.id).forEach(devInfo => {
      devInfo.update(devUpdate);

      discoveredCallback(devInfo);
    });
  });

  watcher.addEventListener("enumerationcompleted", () => {
    watcher.stop();
  });

  watcher.addEventListener("stopped", () => {
    stoppedCallback();
  });

  return watcher;
}

plugin.watcher = setupDiscoveryWatcher(devInfo => {
  plugin.discovered({
    name: devInfo.name ? devInfo.name : 'Unknown',
    address: devInfo.id
  });
}, () => {
  plugin.discovering = false;
});

async function loadMessageAsync(reader) {
  const BYTES_TO_READ = 1;

  let message = '';
  let bytesRead = 0;
  let char = null;
  do {
    bytesRead = await reader.loadAsync(BYTES_TO_READ);
    if (bytesRead < BYTES_TO_READ) {
      throw new Error('Client disconnected');
    }

    char = reader.readString(bytesRead);
    if (char !== '\n') {
      message += char;
    }
  } while (char !== '\n');

  return message;
}

async function findServiceAsync(id) {
  let service = await Windows.Devices.Bluetooth.Rfcomm.RfcommDeviceService.fromIdAsync(id);
  if (!service) {
    const services = await listServicesAsync();
    const matching = services.filter(service => {
      return service.id.toLowerCase().indexOf(id.toLowerCase()) !== -1;
    });

    if (matching.length > 0) {
      service = await Windows.Devices.Bluetooth.Rfcomm.RfcommDeviceService.fromIdAsync(matching[0].id);
    }
  }
  return service;
}

async function findDeviceAsync(id) {
  return await Windows.Devices.Bluetooth.BluetoothDevice.fromIdAsync(id);
}

async function listServicesAsync() {
  return await Windows.Devices.Enumeration.DeviceInformation.findAllAsync(
    Windows.Devices.Bluetooth.Rfcomm.RfcommDeviceService.getDeviceSelector(
      Windows.Devices.Bluetooth.Rfcomm.RfcommServiceId.fromUuid(SERVICE_UUID)
    ),
    null
  );
}

async function listPairedDevicesAsync() {
  const devices = await Windows.Devices.Enumeration.DeviceInformation.findAllAsync(
    Windows.Devices.Bluetooth.BluetoothDevice.getDeviceSelector(),
    null
  );
  
  return devices.map(device => {
    return {
      name: device.name ? device.name : 'Unknown',
      address: device.id
    };
  });
}

async function getDevicesAsync(services) {
  const devices = [];
  for (const service of services) {
    const device = await Windows.Devices.Bluetooth.BluetoothDevice.fromIdAsync(service.id);
    devices.push({
      name: device && device.name ? device.name : 'Unknown',
      address: service.id
    });
  }
  return devices;
}

async function connectToServiceAsync(service) {
  const socket = new Windows.Networking.Sockets.StreamSocket();
  await socket.connectAsync(
    service.connectionHostName,
    service.connectionServiceName,
    Windows.Networking.Sockets.SocketProtectionLevel.plainSocket
  );

  return socket;
}

cordova.commandProxy.add("Bluetooth", {
  getSupported: async (successCallback, errorCallback) => {
    try {
      const adapter = await getBluetoothAdapterAsync();
      successCallback(adapter !== null)
    } catch (e) {
      errorCallback(e);
    }
  },
  getState: async (successCallback, errorCallback) => {
    try {
      const adapter = await getBluetoothAdapterAsync();
      if (adapter) {
        successCallback(StateMap[adapter.state]);
      } else {
        errorCallback('Bluetooth is not supported');
      }
    } catch (e) {
      errorCallback(e);
    }
  },
  getDiscoverable: (successCallback, errorCallback) => {
    successCallback(false);
  },
  getListening: (successCallback, errorCallback) => {
    successCallback(false);
  },
  getConnected: (successCallback) => {
    successCallback(!!plugin.connectedDevice)
  },
  requestEnable: (successCallback, errorCallback) => {
    try {
      Windows.System.Launcher.launchUriAsync(Windows.Foundation.Uri("ms-settings-bluetooth:"));
      successCallback()
    } catch (e) {
      errorCallback(e)
    }
  },
  enable: (successCallback, errorCallback) => {
    try {
      Windows.System.Launcher.launchUriAsync(Windows.Foundation.Uri("ms-settings-bluetooth:"));
      successCallback()
    } catch (e) {
      errorCallback(e)
    }
  },
  disable: (successCallback, errorCallback) => {
    try {
      Windows.System.Launcher.launchUriAsync(Windows.Foundation.Uri("ms-settings-bluetooth:"));
      successCallback()
    } catch (e) {
      errorCallback(e)
    }
  },
  listPairedDevices: async (successCallback, errorCallback) => {
    try {
      const adapter = await getBluetoothAdapterAsync();

      if (!adapter || !adapter.state === Windows.Devices.Radios.RadioState.on) {
        errorCallback("Bluetooth is not enabled");
        return;
      }

      const devices = await listPairedDevicesAsync();

      successCallback(devices);
    } catch (e) {
      errorCallback(e);
    }
  },
  startDiscovery: async (successCallback, errorCallback) => {
    if (plugin.discovering) {
      errorCallback("Already discovering");
      return;
    }

    try {
      plugin.discovering = true;

      const adapter = await getBluetoothAdapterAsync();

      if (!adapter || !adapter.state === Windows.Devices.Radios.RadioState.on) {
        errorCallback("Bluetooth is not enabled");
        return;
      }

      plugin.watcher.start();

      successCallback();
    } catch (e) {
      plugin.discovering = false;
      errorCallback(e);
    }
  },
  cancelDiscovery: async (successCallback, errorCallback) => {
    if (!plugin.discovering) {
      errorCallback("Not discovering");
      return;
    }

    try {
      if (!plugin.watcher) {
        errorCallback("Device watcher isn't initialized");
        return
      }

      plugin.watcher.stop();

      successCallback()
    } catch (e) {
      errorCallback(e);
    }
  },
  enableDiscovery: (successCallback, errorCallback) => {
    errorCallback('Discoverable mode is not supported');
  },
  startListening: (successCallback, errorCallback) => {
    errorCallback('Listening mode is not supported');
  },
  stopListening: (successCallback, errorCallback) => {
    errorCallback('Listening mode is not supported');
  },
  connect: async (successCallback, errorCallback, params) => {
    try {
      const adapter = await getBluetoothAdapterAsync();

      if (!adapter || !adapter.state === Windows.Devices.Radios.RadioState.on) {
        errorCallback("Bluetooth is not enabled");
        return;
      }

      if (plugin.connectedDevice) {
        errorCallback("Already connected");
        return;
      }

      const device = params[0];

      plugin.service = await findServiceAsync(device.address);
      if (plugin.service) {
        plugin.socket = await connectToServiceAsync(plugin.service);
        plugin.writer = new Windows.Storage.Streams.DataWriter(plugin.socket.outputStream);
        plugin.connectedDevice = device;

        successCallback();
        return;
      }

      const bluetoothDevice = await Windows.Devices.Bluetooth.BluetoothDevice.fromIdAsync(device.address);

      if (!bluetoothDevice) {
        errorCallback('Failed to find a device with id: ' + device.address);
        return;
      }

      const pairingResult = await bluetoothDevice.deviceInformation.pairing.pairAsync();

      if (!pairingResult || (pairingResult.status !== 3 && pairingResult.status !== Windows.Devices.Enumeration.DevicePairingResultStatus.paired)) {
        errorCallback('Failed to pair devices');
        return;
      }

      plugin.service = await findServiceAsync(device.address);
      if (plugin.service) {
        plugin.socket = await connectToServiceAsync(plugin.service);
        plugin.writer = new Windows.Storage.Streams.DataWriter(plugin.socket.outputStream);
        plugin.connectedDevice = device;

        successCallback();
        return;
      }

      errorCallback('Failed to pair and then connect');
    } catch (e) {
      if (plugin.writer) {
        plugin.writer.detachStream();
        plugin.writer = null;
      }

      if (plugin.socket) {
        plugin.socket.close();
        plugin.socket = null;
      }
      errorCallback(e);
    }
  },
  disconnect: (successCallback, errorCallback) => {
    plugin.connectedDevice = null;
    try {
      if (plugin.writer) {
        plugin.writer.detachStream();
        plugin.writer = null;
      }

      if (plugin.socket) {
        plugin.socket.close();
        plugin.socket = null;
      }
      successCallback();
    } catch (e) {
      errorCallback(e);
    }
  },
  startReading: async (successCallback, errorCallback) => {
    if (!plugin.socket) {
      errorCallback("Not connected");
      return;
    }

	let reader = null;
	
    try {
      plugin.reading = true;

      successCallback();

	  reader = new Windows.Storage.Streams.DataReader(plugin.socket.inputStream)
	  
      do {
        const message = await loadMessageAsync(reader);
        console.log('received', message);
        plugin.message(message);
      } while (plugin.reading);
    } catch (e) {
      disconnect();

      errorCallback(e);
    } finally {
      reader.detachStream();
      plugin.reading = false;
    }
  },
  getReading: (successCallback) => {
    successCallback(plugin.reading)
  },
  stopReading: function (successCallback, errorCallback) {
    if (!plugin.reading) {
      errorCallback("Not reading");
      return;
    }

    plugin.reading = false;

    successCallback()
  },
  write: async (successCallback, errorCallback, params) => {
    try {
      const message = params[0];

      console.log('sending', message);
	  
      plugin.writer.writeString(message + '\n');
      await plugin.writer.storeAsync();
      successCallback()
    } catch (e) {
      errorCallback(e);
    }
  },
  setSupportedCallback: successCallback => plugin.supportedCallback = successCallback,
  setConnectedCallback: successCallback => plugin.connectedDeviceCallback = successCallback,
  setDiscoveredCallback: successCallback => plugin.discoveredCallback = successCallback,
  setDiscoveryCallback: successCallback => plugin.discoveringCallback = successCallback,
  setMessageCallback: successCallback => plugin.messageCallback = successCallback,
  setStateCallback: successCallback => plugin.stateCallback = successCallback,
  setDiscoverableCallback: () => {},
  setListeningCallback: () => {},
});
