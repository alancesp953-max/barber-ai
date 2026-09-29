export function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`timeout_${label}_${ms}ms`)
      error.code = 'ETIMEOUT'
      reject(error)
    }, ms)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export function isTimeoutError(error) {
  const message = String(error?.message || error || '')
  return error?.code === 'ETIMEOUT' || error?.name === 'AbortError' || /timeout|aborted/i.test(message)
}
