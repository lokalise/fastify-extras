import fs from 'fs'

import build from 'pino-abstract-transport'

export function processLogBuilder() {
  return async function processLogs(source: any) {
    for await (const obj of source) {
      if (!obj) {
        //        if (options.onDebug) {
        // handle this somehow
        //          options.onDebug('Log source object is empty')
      }

      return
    }

    fs.writeFileSync('file.file', 'karbunk')
    // send log here
  }
}

module.exports = function (options: any) {
  return build(processLogBuilder())
}
