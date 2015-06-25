var app           = require('app');  // Module to control application life.
var BrowserWindow = require('browser-window');  // Module to create native browser window.
var ipc           = require('ipc');
var GithubVersion = require('./githubVersion.js').GithubVersion;
var Mirobot       = require('mirobot').Mirobot;
var mirobot       = new Mirobot();
var url           = require('url');

mirobot.debug = true;
var Menu = require('menu');
var MenuItem = require('menu-item');

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
  mainWindow = new BrowserWindow({width: 500, height: 280});
  
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
      mainWindow.webContents.send('updateArduino', JSON.stringify({state: 'connecterror'}));
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
  mirobot.on('updateProgress', function(prog){
    mainWindow.webContents.send('updateArduino', JSON.stringify({state: 'progress', amount: prog}));
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
  
  sendPrerelease = function(state){
    sendMsg('prerelease', {state: state});
  }

  sendReady = function(type){
    ready[type] = true;
    if(ready.ui && ready.arduino){
      mainWindow.webContents.send('ready');
    }
  }
  
  mainWindow.webContents.on('did-finish-load', function() {
    var arduinoVersion = new GithubVersion('mirobot/mirobot-arduino', 'mirobot.hex');
    var uiVersion = new GithubVersion('mirobot/mirobot-ui', 'mirobot.bin');

    var initVersions = function(){
      sendStatus('Checking latest versions');
      arduinoVersion.init(usePrereleases);
      uiVersion.init(usePrereleases);
    }

    var usePrereleases = false;
    var togglePrerelease = function(){
      usePrereleases = !usePrereleases;
      sendPrerelease(usePrereleases);
      initVersions();
    }

    arduinoVersion.on('ready', function(){
      versions.arduinoLatest = arduinoVersion.version;
      sendReady('arduino')
    });
    arduinoVersion.on('error', function(err){
      sendStatus(err.msg);
    });
  
    uiVersion.on('ready', function(){
      versions.uiLatest = uiVersion.version;
      sendReady('ui')
    });
    uiVersion.on('error', function(err){
      sendStatus(err.msg);
    });
    initVersions();

    var menuTemplate = [
      {
        label: 'Atom Shell',
        submenu: [
          {label: 'About Mirobot Updater', selector: 'orderFrontStandardAboutPanel:'},
          {type: 'separator'},
          {label: 'Services',submenu: []},
          {type: 'separator'},
          {label: 'Hide Atom Shell', accelerator: 'Command+H', selector: 'hide:'},
          {label: 'Hide Others', accelerator: 'Command+Shift+H', selector: 'hideOtherApplications:'},
          {label: 'Show All', selector: 'unhideAllApplications:'},
          {type: 'separator'},
          {label: 'Use prereleases', accelerator: 'Command+Shift+R', type: 'checkbox', click: function() { togglePrerelease(); }},
          {type: 'separator'},
          {label: 'Quit', accelerator: 'Command+Q', click: function() { app.quit(); }},
        ]
      },
      {
        label: 'Edit',
        submenu: [
          {label: 'Undo', accelerator: 'Command+Z', selector: 'undo:'},
          {label: 'Redo', accelerator: 'Shift+Command+Z', selector: 'redo:'},
          {type: 'separator'},
          {label: 'Cut', accelerator: 'Command+X', selector: 'cut:'},
          {label: 'Copy', accelerator: 'Command+C', selector: 'copy:'},
          {label: 'Paste', accelerator: 'Command+V', selector: 'paste:'},
          {label: 'Select All', accelerator: 'Command+A', selector: 'selectAll:'},
        ]
      },
      {
        label: 'Window',
        submenu: [
          {label: 'Minimize', accelerator: 'Command+M', selector: 'performMiniaturize:'},
          {label: 'Close', accelerator: 'Command+W', selector: 'performClose:'},
          {type: 'separator'},
          {label: 'Bring All to Front', selector: 'arrangeInFront:'},
        ]
      },
    ];
    var menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
    
    ipc.on('connect', function(event, ip) {
      mirobot.connect(ip);
    });
    
    ipc.on('updateUI', function(){
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