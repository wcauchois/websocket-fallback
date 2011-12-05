
var ws = require('./fallback.js');

var serv = ws.createServer();

serv.on('connection', function(conn) {
  console.log("client connected!");
  conn.on('message', function(msg) {
    console.log("got message: " + msg);
    conn.send(msg);
  });
});

serv.listen(10080, "localhost", function() {
  console.log("listening on port 10080...");
});

