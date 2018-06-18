  var rfcomm = Windows.Devices.Bluetooth.Rfcomm
  var sockets = Windows.Networking.Sockets
  var streams = Windows.Storage.Streams
  var deviceInfo = Windows.Devices.Enumeration.DeviceInformation
  //var wsc = Windows.Security.Cryptography
  var SERVICE_UUID = "{995f40e0-ce68-4d24-8f68-f49d2b9d661f}"
  // The Id of the Service Name SDP attribute
  var SDP_SERVICE_NAME_ATTRIBUTE_ID = 0x100
  // The SDP Type of the Service Name SDP attribute.
  // The first byte in the SDP Attribute encodes the SDP Attribute Type as follows :
  //    -  the Attribute Type size in the least significant 3 bits,
  //    -  the SDP Attribute Type value in the most significant 5 bits.
  var SDP_SERVICE_NAME_ATTRIBUTE_TYPE = (4 << 3) | 5

  var _service
  var _socket
  var _services
  var _writer
  var _reader
  var _isReading

  var _bluetoothAdapter
  var _watcher
  var _deviceArray = []

  var _messageCallback
  var _connectedCallback
  var _stateCallback
  var _discoveryCallback
  var _discoveredCallback
  var _discoverableCallback

  var ANDROID_STATE_OFF = 0x0000000a
  var ANDROID_STATE_TURNING_ON = 0x0000000b
  var ANDROID_STATE_ON = 0x0000000c
  var ANDROID_STATE_TURNING_OFF = 0x0000000d

  var _stateMap = {}
  _stateMap[Windows.Devices.Radios.RadioState.disabled] = ANDROID_STATE_OFF
  _stateMap[Windows.Devices.Radios.RadioState.off] = ANDROID_STATE_OFF
  _stateMap[Windows.Devices.Radios.RadioState.on] = ANDROID_STATE_ON
  _stateMap[Windows.Devices.Radios.RadioState.unknown] = ANDROID_STATE_OFF

  _watcher = new Windows.Devices.Enumeration.DeviceInformation.createWatcher
    (Windows.Devices.Bluetooth.BluetoothDevice.getDeviceSelectorFromPairingState(false), null)
  _watcher.addEventListener("added", onAdded)
  _watcher.addEventListener("removed", onRemoved)
  _watcher.addEventListener("updated", onUpdated)
  _watcher.addEventListener("enumerationcompleted", onEnumerationCompleted)
  _watcher.addEventListener("stopped", onStopped)

  function onAdded(devinfo) {
    //Windows.Devices.Bluetooth.BluetoothDevice.fromIdAsync(devinfo.id)
    //  .then((device) => {
    //    let doesSupportService = !!device.rfcommServices.reduce((count, service) => { return SERVICE_UUID.includes(service.serviceId.uuid) ? count + 1 : count }, 0)
        
    //    if (doesSupportService && _discoveredCallback) {
    //      _discoveredCallback({ name: devinfo.name ? devinfo.name : 'Communications device', address: devinfo.id }, { keepCallback: true })
    //    }
    //  })

    if (_discoveredCallback) {
      _discoveredCallback({ name: devinfo.name ? devinfo.name : 'Communications device', address: devinfo.id }, { keepCallback: true })
    }

    console.log("<p>Device added: " + devinfo.name + "</p>")
    _deviceArray.push(devinfo)
  }

  function onUpdated(devUpdate) {
    console.log(`<p>Device updated. ID: ${devUpdate.id} and ${devUpdate.name} "</p>`)
    for (var i = 0; i < _deviceArray.length; i++) {
      if (_deviceArray[i].id == devUpdate.id) {
        _deviceArray[i].update(devUpdate)

        if (_discoveredCallback) {
          _discoveredCallback({ name: _deviceArray[i].name ? _deviceArray[i].name : 'Communications device', address: _deviceArray[i].id }, { keepCallback: true })
        }
        console.log(`<p>Device updated. name:  ${_deviceArray[i].name} "</p>`)
      }
    }
  }

  function onRemoved(devUpdate) {
    console.log(`<p>Device removed. ID: ${devUpdate.id} "</p>`);
    for (var i = 0; i < _deviceArray.length; i++) {
      if (_deviceArray[i].id == devUpdate.id) {
        _deviceArray.splice(i, 1)
      }
    }
  }

  function onEnumerationCompleted(obj) {
    _watcher.stop()
    console.log("<p>Enumeration Completed.</p>")
  }

  function onStopped(obj) {
    _discoveryCallback(false, { keepCallback: true })
    console.log("<p>Stopped.</p>")
  }

  function adapterStateChanged(result) {
    console.log('adapter state changed, new state: ' + _stateMap[_bluetoothAdapter.state])
    _stateCallback(_stateMap[_bluetoothAdapter.state], { keepCallback: true })
  }

  async function getBluetoothAdapterAsync() {
    var radios = await Windows.Devices.Radios.Radio.getRadiosAsync()
    console.log('radios: ' + radios)
    var bluetoothAdapter = radios.filter(function (radio) {
      return radio.name === 'Bluetooth'
    })[0]
    _bluetoothAdapter = bluetoothAdapter
    if (_bluetoothAdapter) {
      _bluetoothAdapter.addEventListener('statechanged', adapterStateChanged)
    }
    return bluetoothAdapter
  }

  getBluetoothAdapterAsync()

  async function loadMessageAsync(reader) {
    var message = ''
    var actualStringLength = 0
    var BYTES_TO_READ = 1
    while (true) {
      actualStringLength = await reader.loadAsync(BYTES_TO_READ)
      if (actualStringLength < BYTES_TO_READ) {
        disconnect()
        console.log("Client disconnected.")
        if (_connectedCallback) {
          _connectedCallback(null, { keepCallback: true, status: cordova.callbackStatus.ERROR })
        }
        _isReading = false
        break
      }
      var char = reader.readString(actualStringLength)
      if (char !== '\n') {
        message += char
      } else break
    }

    return message
  }

  function receiveStringLoop(reader) {
    if (!_isReading) return

    loadMessageAsync(reader).then(message => {
      console.log("Received: " + message)
      if (_messageCallback) {
        _messageCallback(message, { keepCallback: true })
      }
      // Restart the read for more bytes. We could just call receiveStringLoop() but in the case subsequent
      // read operations complete synchronously we start building up the stack and potentially crash. We use
      // WinJS.Promise.timeout() invoke this function after the stack for current call unwinds.
      WinJS.Promise.timeout().done(function () { return receiveStringLoop(reader) })
    }, function (error) {
      _isReading = false
      console.log("Failed to read the message, with error: " + error)
      // TODO:
      //_messageErrorCallback(error)
    })
  }

  function disconnect() {
    if (_writer) {
      _writer.detachStream()
      _writer = null
    }

    if (_socket) {
      _socket.close()
      _socket = null
    } else {
      console.log('not connected')
    }
  }

  async function getDevicesFromServicesAsync(services) {
    let devices = []
    for (service of services) {
      let dev = await Windows.Devices.Bluetooth.BluetoothDevice.fromIdAsync(service.id)
      let device = { name: dev.name, address: service.id }
      devices.push(device)
    }

    return devices
  }

  async function connectAsync(successCallback, errorCallback, params) {
    if (!_bluetoothAdapter ||
      !_bluetoothAdapter.state === Windows.Devices.Radios.RadioState.on) {
      errorCallback("Bluetooth is not enabled")
      return
    }

    if (_socket) {
      errorCallback("Already connected")
      return
    }

    let device = params[0]

    let service
    try {
      service = await rfcomm.RfcommDeviceService.fromIdAsync(device.address)
    }
    catch (error) {
      const errorMessage = 'failed to create rfcomm service from device address (id) with error: ' + error
      console.log(errorMessage)
      errorCallback(errorMessage)
      return
    }

    if (service) {
      connectToService(successCallback, errorCallback, service, device)
      return
    }

    // Get object with full info including supported rfcomm services, pairing, ...
    let bluetoothDevice
    try {
      bluetoothDevice = await Windows.Devices.Bluetooth.BluetoothDevice.fromIdAsync(device.address)
    }
    catch (error) {
      const errorMessage = 'failed to create bluetooth device from device address with error: ' + error
      errorCallback(errorMessage)
      return
    }

    let pairingResult
    try {
      pairingResult = await bluetoothDevice.deviceInformation.pairing.pairAsync();
    }
    catch (error) {
      const errorMessage = 'failed to pair devices with error: ' + error
      errorCallback(errorMessage)
      return
    }

    console.log('pairing result: ')
    console.log(pairingResult)

    if (!pairingResult || (pairingResult.status !== 3 && pairingResult.status !== Windows.Devices.Enumeration.DevicePairingResultStatus.paired)) {
      const errorMessage = 'failed to pair devices'
      console.log(errorMessage)
      errorCallback(errorMessage)
      return
    }

    // const service = bluetoothDevice.rfcommServices.filter((service) => { return SERVICE_UUID.includes(service.serviceId.uuid) })[0]
    const services = await Windows.Devices.Enumeration.DeviceInformation.findAllAsync(
      rfcomm.RfcommDeviceService.getDeviceSelector(rfcomm.RfcommServiceId.fromUuid(SERVICE_UUID)),
      null)
    if (services.length > 0) {
      const service = services.filter(function (service) { return service.id.startsWith(device.address) })[0]
      //console.log('SERVICE!!! ID: ' + service.id)
      await connectAsync(successCallback, errorCallback, [{ address: service.id, name: device.name }])
    } else {
      const errorMessage = "No services were found AFTER PAIRING. "
      console.log(errorMessage)
      errorCallback(errorMessage)
    }
  }


  function connectToService(successCallback, errorCallback, service, device) {
    _service = service

    _service.getSdpRawAttributesAsync(Windows.Devices.Bluetooth.BluetoothCacheMode.uncached).done(
      function (attributes) {
        var buffer = attributes.lookup(SDP_SERVICE_NAME_ATTRIBUTE_ID)
        if (buffer === null) {
          var errorMessage = "The Spatium service is not advertising the Service Name attribute (attribute " +
            "id=0x100). Please verify that you are running the Spatium server."
          errorCallback(errorMessage)
          console.log(errorMessage)
          return
        }

        var attributeReader = streams.DataReader.fromBuffer(buffer)
        var attributeType = attributeReader.readByte()
        if (attributeType !== SDP_SERVICE_NAME_ATTRIBUTE_TYPE) {
          var errorMessage = "The Spatium service is using an expected format for the Service Name attribute. " +
            "Please verify that you are running the Spatium server."
          errorCallback(errorMessage)
          console.log(errorMessage)
          return
        }

        var serviceNameLength = attributeReader.readByte()

        // The Service Name attribute requires UTF-8 encoding.
        attributeReader.unicodeEncoding = streams.UnicodeEncoding.utf8
        //console.log("Service Name: \"" + attributeReader.readString(serviceNameLength) + "\"")

        _socket = new sockets.StreamSocket()
        _socket.connectAsync(
          _service.connectionHostName,
          _service.connectionServiceName,
          sockets.SocketProtectionLevel.plainSocket).done(function () {
            _writer = new streams.DataWriter(_socket.outputStream)
            _connectedCallback(device, { keepCallback: true })
            successCallback()
          }, function (error) {
            console.log("Failed to connect to server, with error: " + error)
            errorCallback(error)
          })
      }, function (error) {
        console.log("Failed to retrieve SDP attributes, with error: " + error)
        errorCallback(error)
      }
    )
  }

  cordova.commandProxy.add("Bluetooth", {
    // echo: function(successCallback,errorCallback,strInput) {
    //     if(!strInput || !strInput.length) {
    //         errorCallback("Error, something was wrong with the input string. =>" + strInput)
    //     }
    //     else {
    //         successCallback(strInput + " echo!")
    //     }
    // },
    getSupported: function (successCallback, errorCallback, params) {
      Windows.Devices.Radios.Radio.getRadiosAsync()
        .done(function (radios) {
          var isSupported = !!radios.reduce(function (acc, radio) {
            return radio.name === 'Bluetooth' ? ++acc : acc
          }, 0)
          successCallback(isSupported)
        })
    },
    getState: function (successCallback, errorCallback, params) {
      if (_bluetoothAdapter) {
        console.log('getState adapter state: ' + _stateMap[_bluetoothAdapter.state])
        successCallback(_stateMap[_bluetoothAdapter.state])
      } else {
        errorCallback("Bluetooth is not supported")
      }
    },
    getDiscoverable: function (successCallback, errorCallback, params) {
      console.log("getDiscoverable!")
    },
    getListening: function (successCallback, errorCallback, params) {
      console.log("getListening!")
    },
    getConnected: function (successCallback, errorCallback, params) {
      successCallback(!!_socket)
    },
    enable: function (successCallback, errorCallback, params) {
      if (_bluetoothAdapter) {
        Windows.System.Launcher.launchUriAsync(Windows.Foundation.Uri("ms-settings-bluetooth:"))
        successCallback()
      }
    },
    listPairedDevices: function (successCallback, errorCallback, params) {
      if (!_bluetoothAdapter || !_bluetoothAdapter.state === Windows.Devices.Radios.RadioState.on) {
        errorCallback("Bluetooth is not enabled")
        return
      }

      Windows.Devices.Enumeration.DeviceInformation.findAllAsync(
        rfcomm.RfcommDeviceService.getDeviceSelector(rfcomm.RfcommServiceId.fromUuid(SERVICE_UUID)),
        null).done(function (services) {
          _services = []
          if (services.length > 0) {
            getDevicesFromServicesAsync(services).then(function (devices) {
              successCallback(devices)
            }, function (error) { console.log('error converting services to devices info: ' + error) })
          } else {
            console.log("No services were found. Please pair Windows with a device that is " +
              "advertising the service")
          }
        })
    },
    startDiscovery: function (successCallback, errorCallback, params) {
      if (!_bluetoothAdapter ||
        !_bluetoothAdapter.state === Windows.Devices.Radios.RadioState.on) {
        errorCallback("Bluetooth is not enabled")
        return
      }
      if (!_watcher) {
        errorCallback("Device watcher isn't initialized")
        return
      }

      try {
        _deviceArray = []
        _watcher.start()
        _discoveryCallback(true, { keepCallback: true })
      }
      catch (e) {
        var message = "Failed to start discovery: " + e.message
        console.log(message)
        errorCallback(message)
        return
      }
      successCallback()
    },
    cancelDiscovery: function (successCallback, errorCallback, params) {
      console.log('cancelDiscovery called!')
      if (!_watcher) {
        errorCallback("Device watcher isn't initialized")
        return
      }
      try {
        if (!_watcher.status === Windows.Devices.Enumeration.DeviceWatcherStatus.stopped)
          _watcher.stop()
        successCallback()
      }
      catch (e) {
        var message = "Failed to cancel discovery: " + e.message
        console.log(message)
        errorCallback(message)
        return
      }
    },
    enableDiscovery: function (successCallback, errorCallback, params) {
      console.log("enableDiscovery!")
    },
    startListening: function (successCallback, errorCallback, params) {
      console.log("startListening!")
    },
    stopListening: function (successCallback, errorCallback, params) {
      console.log("stopListening!")
    },
    connect: async function (successCallback, errorCallback, params) {
      await connectAsync(successCallback, errorCallback, params)
    },
    disconnect: function (successCallback, errorCallback, params) {
      disconnect()
      successCallback()
    },
    startReading: function (successCallback, errorCallback, params) {
      if (!_socket) {
        errorCallback("Not connected")
        return
      }
      _isReading = true
      receiveStringLoop(new streams.DataReader(_socket.inputStream))
      successCallback()
    },
    getReading: function (successCallback, errorCallback, params) {
      successCallback(_isReading)
    },
    stopReading: function (successCallback, errorCallback, params) {
      if (!_isReading) {
        errorCallback("Not reading")
        return
      }

      _isReading = false
      successCallback()
    },
    write: function (successCallback, errorCallback, params) {
      try {
        var message = params[0]
        _writer.writeString(message + '\n')
        _writer.storeAsync().done(function () {
          console.log('message sent: ' + message)
        }, function (error) {
          console.log("Failed to send the message to the server, error: " + error)
          errorCallback(error)
        })

      } catch (error) {
        errorCallback(error)
        console.log("Sending message failed with error: " + error)
      }
      successCallback()
    },
    setConnectedCallback: function (successCallback, errorCallback, params) {
      _connectedCallback = successCallback
    },
    setDiscoverableCallback: function (successCallback, errorCallback, params) {
      _discoverableCallback = successCallback
    },
    setDiscoveredCallback: function (successCallback, errorCallback, params) {
      _discoveredCallback = successCallback
    },
    setDiscoveryCallback: function (successCallback, errorCallback, params) {
      _discoveryCallback = successCallback
    },
    setMessageCallback: function (successCallback, errorCallback, params) {
      _messageCallback = successCallback
    },
    setStateCallback: function (successCallback, errorCallback, params) {
      _stateCallback = successCallback
    }
  })