var util         = require("util");
var EventEmitter = require("events").EventEmitter;
var request = require('request');
var url = require('url');
var os = require('os');
var fs = require('fs');
var path = require('path');

var GithubVersion = function(repo, file){
  EventEmitter.call(this);
  this.repo = repo;
  this.file = file;
  this.tmpDir = path.join(os.tmpDir(), 'mirobot-updater');
}

util.inherits(GithubVersion, EventEmitter);

GithubVersion.prototype.init = function(usePrereleases){
  var self = this;
  self.usePrereleases = usePrereleases;
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
    if(!error && response.statusCode === 200){
      var res = JSON.parse(body);
      for(var i=0; i< res.length; i++){
        if(self.usePrereleases || !res[i].prerelease){
          var assets = res[i].assets.map(function(e){ return e.name; });
          if(assets.indexOf(self.file) >= 0){
            self.latest = res[i];
            self.version = self.latest.tag_name;
            cb();
            break;
          }
        }
      }
    }else{
      if(!error && response.headers['x-ratelimit-remaining'] === '0'){
        self.emit('error', {msg: "Exceeded GitHub rate limit. Try again in " + ((response.headers['x-ratelimit-reset'] - (new Date()).getTime()/1000)/60).toFixed(0) + ' minutes'});
      }else{
        self.emit('error', {msg: "Error fetching latest versions"});
      }
    }
  }).on('error', function(err){
    self.emit('error', {msg: "Error fetching latest versions"});
  });
}

GithubVersion.prototype.storeLatestFile = function(){
  var self = this;
  fs.stat(self.tmpDir, function(err, dir){
    if(!dir){
      fs.mkdirSync(self.tmpDir);
      self.storeLatestFile();
      return;
    }
    fs.writeFile(self.tmpDir + '/' + self.tempFileName(), self.asset, function(err) {
      if(err) {
          console.log(err);
      } else {
          console.log("Cache file saved: " + self.tmpDir + '/' + self.tempFileName());
      }
    });
  });
}

GithubVersion.prototype.fetchLatestFileCached = function(cb){
  var self = this;
  var name = self.tmpDir + '/' + self.tempFileName();
  fs.stat(name, function(err, f){
    if(f){
      fs.readFile(name, function(err, f){
        cb(f);
      });
    }else{
      cb();
    }
  });
}

GithubVersion.prototype.tempFileName = function(){
  return this.repo.replace('/', '-') + '_' + this.file + '_' + this.version;
}

GithubVersion.prototype.fetchLatestFile = function(cb){
  var self = this;
  self.fetchLatestFileCached(function(f){
    if(f){
      self.asset = f;
      cb()
    }else{
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
          headers: {'User-Agent': 'Mirobot Updater'},
          encoding: null
        }
        request(options, function(error, response, body) {
          if(!error){
            self.asset = body;
            self.storeLatestFile();
            cb();
          }else{
            self.emit('error', {msg: "Couldn't fetch latest release asset"});
          }
        });
      }else{
        self.emit('error', {msg: "Couldn't find a suitable release asset"});
      }
    }
  });
}

exports.GithubVersion = GithubVersion;