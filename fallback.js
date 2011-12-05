
var util = require("util");
var events = require("events");
var http = require("http");

var ws = require("websocket-server"),
    WebSocketRequest = require("websocket").request,
    Mixin = require("websocket-server/lib/lang/mixin"),
    miksagoConnection = require("websocket-server/lib/ws/connection");

exports.createServer = function(options) {
  return new Server(options);
}

function ProxyConnection(conn) {
  events.EventEmitter.call(this);

  this._conn = conn;
  
  var self = this;
  this._conn.on('message', function(msg) {
    if (typeof msg.type !== "undefined") {
      if (msg.type !== "utf8")
        return;
      msg = msg.utf8Data;
    }
    self.emit('message', msg);
  });
}

util.inherits(ProxyConnection, events.EventEmitter);

ProxyConnection.prototype.send = function(msg) {
  if (typeof this._conn.sendUTF == 'function')
    this._conn.sendUTF(msg);
  else
    this._conn.send(msg);
}

function Server(options) {
  events.EventEmitter.call(this);
  options = options || new Object();

  this.httpServer = new http.Server();
  this.miksagoServer = ws.createServer();
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

  var self = this;

  this.miksagoServer.on("connection", function(conn) {
    conn.remoteAddress = conn._socket.remoteAddress;
    self._handleConnection(conn);
  });

  this.httpServer.on("upgrade", function(req, socket, head) {
    if(typeof req.headers["sec-websocket-version"] !== "undefined") {
      var wsRequest = new WebSocketRequest(socket, req, self.config);
      try {
        wsRequest.readHandshake();
        var wsConnection = wsRequest.accept(wsRequest.requestedProtocols[0], wsRequest.origin);
        self._handleConnection(wsConnection);
      } catch(e) {
        self._err(new Error(
            "websocket request unsupported by WebSocket-Node: " + e.toString()));
        return;
      }
    } else {
      if(req.method == "GET" &&
         (req.headers.upgrade && req.headers.connection) &&
         req.headers.upgrade.toLowerCase() === "websocket" &&
         req.headers.connection.toLowerCase() === "upgrade") {
        new miksagoConnection(self.miksagoServer.manager, self.miksagoServer.options, req, socket, head);
      }
    }
  });
}

util.inherits(Server, events.EventEmitter);

Server.prototype._handleConnection = function(conn) {
  this.emit('connection', new ProxyConnection(conn));
}

Server.prototype.listen = function(port, hostname, callback) {
  this.httpServer.listen(port, hostname, callback);
}
