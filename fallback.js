
var util = require('util');
var events = require('events');
var http = require('http');

var WebSocketServer   = require('websocket-server');
var WebSocketRequest  = require('websocket').request;
var Mixin             = require('websocket-server/lib/lang/mixin');
var miksagoConnection = require('websocket-server/lib/ws/connection');

exports.createServer = function(options) {
  return new Server(options);
}

function ProxyConnection(conn, server) {

  events.EventEmitter.call(this);

  this._conn = conn;
  this._server = server;
  this.storage = {};
  this.remoteAddress = this._conn.remoteAddress;
  this.specs = this._conn.specs;

  this._conn.on('message', (function(msg) {
    if (typeof msg.type !== 'undefined') {
      if (msg.type !== 'utf8') {
        return;
      }
      msg = msg.utf8Data;
    }
    this.emit('message', msg);
  }).bind(this));

  this._conn.on('close', (function() {
    this.emit('close');
    this._server.emit('close', this);
  }).bind(this));
}

util.inherits(ProxyConnection, events.EventEmitter);

ProxyConnection.prototype.send = function(msg) {
  if (typeof this._conn.sendUTF == 'function') {
    this._conn.sendUTF(msg);
  } else {
    this._conn.send(msg);
  }
};

function Server(options) {
  events.EventEmitter.call(this);
  options = options || {};

  this.httpServer = options.httpServer || new http.Server();
  this.miksagoServer = WebSocketServer.createServer();
  this.miksagoServer.server = this.httpServer;

  this._err = options.err || function(e) { };
  this.config = Mixin({
    maxReceivedFrameSize: 0x10000,
    maxReceivedMessageSize: 0x100000,
    fragmentOutgoingMessages: true,
    fragmentationThreshold: 0x4000,
    keepalive: true,
    keepaliveInterval: 20000,
    assembleFragments: true,
    disableNagleAlgorithm: true,
    closeTimeout: 5000
  }, options.config);

  this.miksagoServer.on('connection', (function(conn) {
    conn.remoteAddress = conn._socket.remoteAddress;
    conn.specs = 'legacy';
    this._handleConnection(conn);
  }).bind(this));

  this.httpServer.on('upgrade', (function(req, socket, head) {

    if (typeof req.headers['sec-websocket-version'] !== 'undefined') {
      var wsRequest = new WebSocketRequest(socket, req, this.config);
      try {
        wsRequest.readHandshake();
        var wsConnection = wsRequest.accept(wsRequest.requestedProtocols[0], wsRequest.origin);
        wsConnection.specs = 'current';
        this._handleConnection(wsConnection);
      } catch(e) {
        this._err(new Error('websocket request unsupported by WebSocket-Node: ' + e.toString()));
        return;
      }
    } else {
      this.specs = 'legacy';
      if (req.method == 'GET' &&
         (req.headers.upgrade && req.headers.connection) &&
         req.headers.upgrade.toLowerCase() === 'websocket' &&
         req.headers.connection.toLowerCase() === 'upgrade') {
        new miksagoConnection(this.miksagoServer.manager, this.miksagoServer.options, req, socket, head);
      }
    }

  }).bind(this));
}

util.inherits(Server, events.EventEmitter);

Server.prototype._handleConnection = function(conn) {
  this.emit('connection', new ProxyConnection(conn, this));
}

Server.prototype.listen = function(port, hostname, callback) {
  this.httpServer.listen(port, hostname, callback);
}
