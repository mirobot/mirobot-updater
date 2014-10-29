var app           = require('app');  // Module to control application life.
var BrowserWindow = require('browser-window');  // Module to create native browser window.
var ipc           = require('ipc');
var GithubVersion = require('./githubVersion.js').GithubVersion;
var Mirobot       = require('mirobot').Mirobot;
var mirobot       = new Mirobot();

//mirobot.debug = true;

var versions = {
  arduino: null,
  arduinoLatest: null,
  ui: null,
  uiLatest: null
}

var ready = {ui: false, arduino: false}

// Report crashes to our server.
require('crash-reporter').start();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the javascript object is GCed.
var mainWindow = null;

// Quit when all windows are closed.
app.on('window-all-closed', function() {
    app.quit();
});

// This method will be called when atom-shell has done everything
// initialization and ready for creating browser windows.
app.on('ready', function() {
  // Create the browser window.
  mainWindow = new BrowserWindow({width: 500, height: 270});
  
  // and load the index.html of the app.
  mainWindow.loadUrl('file://' + __dirname + '/../html/index.html');
  
  // Emitted when the window is closed.
  mainWindow.on('closed', function() {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
  
  var arduinoError = false;

  var fetchVersions = function(options){
    options = options || {arduino: true, ui: true};
    if(options.arduino){
      mirobot.version(function(resp, msg){
        if(resp === 'complete'){
          versions.arduino = msg.msg;
          sendVersions();
        }
      });
    }
    if(options.ui){
      mirobot.getUIVersion(function(err, v){
        if(!err){
          versions.ui = v
          sendVersions();
        }else{
          sendStatus("Error fetching UI version");
          versions.ui = 'unknown'
          sendVersions();
        }
      });
    }
  }

  mirobot.on('error', function(err){
    if(err.msg === "Can't connect to Arduino"){
      arduinoError = true;
      mainWindow.webContents.send('upgradeArduino', JSON.stringify({state: 'connecterror'}));
    }else{
      sendStatus("Error connecting to Mirobot");
    }
  });
  mirobot.on('socketconnect', function(){
    mainWindow.webContents.send('connected');
    fetchVersions({ui:true});
  });
  mirobot.on('connect', function(){
    mainWindow.webContents.send('connected');
    fetchVersions({arduino:true});
  });
  mirobot.on('upgradeProgress', function(prog){
    mainWindow.webContents.send('upgradeArduino', JSON.stringify({state: 'progress', amount: prog}));
  });

  sendMsg = function(key, msg){
    mainWindow.webContents.send(key, JSON.stringify(msg));
  }
  
  sendVersions = function(){
    sendMsg('versions', versions);
  }
  
  sendStatus = function(status){
    sendMsg('status', {msg: status});
  }
  
  sendReady = function(type){
    ready[type] = true;
    if(ready.ui && ready.arduino){
      mainWindow.webContents.send('ready');
    }
  }
  
  mainWindow.webContents.on('did-finish-load', function() {
    sendStatus('Checking latest versions');
    var arduinoVersion = new GithubVersion('bjpirt/mirobot-arduino', 'mirobot.hex');
    arduinoVersion.on('ready', function(){
      versions.arduinoLatest = arduinoVersion.version;
      sendReady('arduino')
    });
    arduinoVersion.on('error', function(err){
      sendStatus(err.msg);
    });
    arduinoVersion.init();
  
    var uiVersion = new GithubVersion('bjpirt/mirobot-ui', 'mirobot.bin');
    uiVersion.on('ready', function(){
      versions.uiLatest = uiVersion.version;
      sendReady('ui')
    });
    uiVersion.on('error', function(err){
      sendStatus(err.msg);
    });
    uiVersion.init();
    
    ipc.on('connect', function(event, ip) {
      mirobot.connect(ip);
    });
    
    ipc.on('upgradeArduino', function(){
      if(arduinoError){
        mainWindow.webContents.send('upgradeArduino', JSON.stringify({state: 'resetbutton'}));
      }else{
        mainWindow.webContents.send('upgradeArduino', JSON.stringify({state: 'starting'}));
      }
      var proc = arduinoError ? '_updateFirmware' : 'updateFirmware';
      mirobot[proc](arduinoVersion.asset, function(succ){
        if(succ){
          mainWindow.webContents.send('upgradeArduino', JSON.stringify({state: 'success'}));
          setTimeout(fetchVersions, 2000);
        }else{
          mainWindow.webContents.send('upgradeArduino', JSON.stringify({state: 'error'}));
        }
        mirobot.close();
      });
    });
    
    ipc.on('upgradeUI', function(){
      sendStatus("Updating UI, please wait");
      mirobot.updateUI(uiVersion.asset, function(err){
        if(err){
          sendStatus("Error updating UI");
        }else{
          sendStatus("UI successfully updated");
          setTimeout(fetchVersions, 8000);
        }
      });
    });
  });
});