import { WebSocketServer } from 'ws'

const port = Number(process.env.PORT || 5180)

const wss = new WebSocketServer({ port, host: '0.0.0.0' })
console.log(`WS bridge listening on ws://0.0.0.0:${port}`)

wss.on('connection', socket => {
  socket.on('message', raw => {
    const text = raw.toString()
    // Broadcast to everyone (host + all remotes)
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(text)
    }
  })
})

