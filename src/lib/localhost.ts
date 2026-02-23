const isDocker = process.env.NEXT_PUBLIC_DOCKER === 'true'

/** Use host.docker.internal when running inside Docker, 127.0.0.1 otherwise. */
export const LOCALHOST = isDocker ? 'host.docker.internal' : '127.0.0.1'
