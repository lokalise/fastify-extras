import { resolve } from 'node:path'

import type { LoggerOptions } from 'pino'
import { pino } from 'pino'

describe('ErrorReporterPinoTransport', () => {
  it('yeah', () => {
    const transports = [
      {
        target: 'pino/file',
        options: { destination: 1 }, // this writes to stdout
      },

      {
        target: 'pino-pretty', // Use the pretty print transport
        options: { colorize: true }, // Pretty print options
      },
      // ... you can add more transports as needed
    ]

    const logger = pino(
      {
        enabled: true,
        level: 'info',
      },
      pino.transport({ targets: transports }),
    )

    logger.info('This is an info message')
    logger.error(
      new Error(),
      'This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. This is an error message. 312',
    )
  })

  it('Sends errors to a reporter', () => {
    /*
    const transport = pino.transport({
      targets: [
        //{ target: resolve(__dirname, 'BugsnagReporterPinoTransport.ts'), level: 'error' },
        //{ target: resolve(__dirname, '../../../dist/errors/BugsnagReporterPinoTransport.js'), level: 'error' },
        //{ target: 'some-file-transport', options: { destination: '/dev/null' }}
      ],
    })

     */
    //const logger = pino(transport)
    const path = resolve(__dirname, '../../dist/errors/BugsnagReporterPinoTransport2.js')
    expect(path).toBe(
      'C:\\sources\\node\\fastify-extras\\dist\\errors\\BugsnagReporterPinoTransport2.js',
    )

    /*
    const logger = pino(pino.transport({
        targets: [{
          target: path
        }],
      }
    ))

     */

    const pinoConf: LoggerOptions = {
      level: 'trace',
    }

    const logger = pino(
      pinoConf,
      pino.transport({
        targets: [
          {
            target: path,
          },
        ],
        options: {},
      }),
    )

    logger.error('edwe')
  })
})
