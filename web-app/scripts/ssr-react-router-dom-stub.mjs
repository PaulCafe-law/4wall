import React from 'react'

export function Link({ children, to, ...props }) {
  const href = typeof to === 'string' ? to : String(to)
  return React.createElement('a', { ...props, href }, children)
}
