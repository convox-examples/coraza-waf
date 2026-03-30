const http = require("http");

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      message: "Hello from behind the Coraza WAF",
      path: req.url,
      method: req.method,
      headers: req.headers,
    })
  );
});

server.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
