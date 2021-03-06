import { Connection, Session } from 'autobahn'
import AutobahnSessionProxy from './autobahnSessionProxy'

/**
 * AutobahnProxy: makes the autobahn connection api more explicit, aids testing
 */
export default class AutobahnConnectionProxy {
  session: AutobahnSessionProxy
  connection: Connection
  onOpen
  onClose

  constructor(url: string, realm: string, port: number) {
    const useSecure = location.protocol === 'https:'
    const securePort = 443
    let defaultPort = 80

    if (port) {
      defaultPort = port
    }
    this.connection = new Connection({
      realm,
      use_es6_promises: true,
      max_retries: -1, // unlimited retries,
      transports: [
        {
          type: 'websocket',
          url: useSecure ? `wss://${url}:${securePort}/ws` : `ws://${url}:${defaultPort}/ws`,
        },
        {
          type: 'longpoll',
          url: useSecure ? `https://${url}:${securePort}/lp` : `http://${url}:${defaultPort}/lp`,
        },
      ],
    })
  }

  open() {
    this.connection.onopen = (session) => {
      this.session = new AutobahnSessionProxy(session)
      if (this.onOpen) {
        this.onOpen(session)
      }
    }

    this.connection.onclose = (reason: string, details: { reason: string, message: string }): boolean => {
      if (this.onClose) {
        this.onClose(reason, details)
      }
      return true
    }
    this.connection.open()
    return true
  }

  close() {
    this.connection.close()
  }

  onopen(callback: (session: Session) => void) {
    this.onOpen = callback
  }

  onclose(callback: (reason: string, details: { reason: string, message: string }) => void) {
    this.onClose = callback
  }
}
