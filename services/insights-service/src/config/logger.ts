import pino from 'pino';
import { env } from './env';

export const logger = pino({
  name: 'insights-service',
  level: env.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
    : {}),
});
