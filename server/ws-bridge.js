import { WebSocketServer } from 'ws'

export function startBridge(port = Number(process.env.PORT || 5180)) {
  const wss = new WebSocketServer({ port, host: '0.0.0.0' })
  console.log(`WS bridge listening on ws://0.0.0.0:${port}`)

  wss.on('connection', socket => {
    socket.on('message', raw => {
      const text = raw.toString()
      for (const client of wss.clients) {
        if (client.readyState === 1) client.send(text)
      }
    })
  })

  return wss
}

const isDirectRun = (() => {
  try {
    const invoked = process.argv[1]
    if (!invoked) return false
    return new URL(invoked, 'file:').href === import.meta.url
  } catch {
    return false
  }
})()

if (isDirectRun) startBridge()
