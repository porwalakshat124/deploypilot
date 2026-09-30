import { createServer } from "node:http";
createServer((request, response) => {
  response.writeHead(request.url === "/health" ? 200 : 404);
  response.end(request.url === "/health" ? "healthy" : "not found");
}).listen(3000, "0.0.0.0");
