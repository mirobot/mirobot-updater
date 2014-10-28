var util         = require("util");
var EventEmitter = require("events").EventEmitter;
var request = require('request');
var url = require('url');

var GithubVersion = function(repo, file){
  EventEmitter.call(this);
  this.repo = repo;
  this.file = file;
}

util.inherits(GithubVersion, EventEmitter);

GithubVersion.prototype.init = function(){
  var self = this;
  self.fetchLatestRelease(function(){
    self.fetchLatestFile(function(){
      self.emit('ready');
    });
  });
}

GithubVersion.prototype.fetchLatestRelease = function(cb){
  var self = this;
  var options = {
    url: 'https://api.github.com/repos/' + this.repo + '/releases',
    headers: {'User-Agent': 'Mirobot Updater'}
  }
  request(options, function(error, response, body) {
    if(!error){
      self.latest = JSON.parse(body)[0];
      self.version = self.latest.tag_name;
      cb()
    }else{
      self.emit('error', {msg: "Error fetching latest versions"});
    }
  }).on('error', function(err){
    self.emit('error', {msg: "Error fetching latest versions"});
  });
}

GithubVersion.prototype.fetchLatestFile = function(cb){
  var self = this;
  var asset = null;
  for(var i = 0; i< self.latest.assets.length; i++){
    if(self.latest.assets[i].name === self.file){
      asset = self.latest.assets[i];
      break;
    }
  }
  if(asset){
    var options = {
      url: asset.browser_download_url,
      headers: {'User-Agent': 'Mirobot Updater'}
    }
    request(options, function(error, response, body) {
      if(!error){
        self.asset = body;
        cb()
      }else{
        self.emit('error', {msg: "Couldn't fetch latest release asset"});
      }
    });
  }else{
    self.emit('error', {msg: "Couldn't find a suitable release asset"});
  }
}

exports.GithubVersion = GithubVersion;