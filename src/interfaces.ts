import { LogType } from "./types";

export interface Options {
    method: string
    body?: string;
    headers?: { [key: string]: string };
}

export interface secretOptions {
  body?: string;
  headers?: { [key: string]: string };
}

export interface SendLogsParams {
    sessionId: string;
    logType: LogType;
    applicationId: string;
}
