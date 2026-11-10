import { ReclaimClient } from '../src'
import { config } from 'dotenv'
import { TODO_URL } from './modes'
config()

// Static JSON endpoint ({"userId":1,"id":1,"title":"delectus aut autem",...}).
// Unlike a live price API it doesn't rate-limit, so these tests stay stable.
const TITLE_REGEX = '"title": "(?<title>[^"]*)"'

const options = (contextMessage: string) => ({
    method: "GET",
    context: {
        contextAddress: "0x0000000000000000000000000000000000000000",
        contextMessage,
    },
})

// Get your APP_ID and APP_SECRET from the Reclaim Devtool (https://dev.reclaimprotocol.org/)
const client = () => new ReclaimClient(process.env.APP_ID!, process.env.APP_SECRET!, true)

export const getTodo = async () =>
    client().zkFetch(TODO_URL, options("todo"), {
        responseMatches: [{ type: 'regex' as const, value: TITLE_REGEX }],
        responseRedactions: [{ regex: TITLE_REGEX, hash: 'oprf-raw' as const }],
    })

export const getTodoPlain = async () =>
    client().zkFetch(TODO_URL, options("todo_plain"), {
        responseMatches: [{ type: 'regex' as const, value: TITLE_REGEX }],
        responseRedactions: [{ regex: TITLE_REGEX }],
    })

export const getTodoSnarkjs = async () =>
    client().zkFetch(TODO_URL, { ...options("todo_snarkjs"), zkEngine: 'snarkjs' as const }, {
        responseMatches: [{ type: 'regex' as const, value: TITLE_REGEX }],
        responseRedactions: [{ regex: TITLE_REGEX }],
    })
