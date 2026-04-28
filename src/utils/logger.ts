import pino from 'pino';
import { config } from '../config.js';

const pinoConfig: pino.LoggerOptions = {
  level: config.logLevel,
};

if (config.logFormat !== 'json') {
  pinoConfig.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  };
}

export const logger = pino(pinoConfig);
