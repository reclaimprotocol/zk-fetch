import { ReclaimClient } from '../src'
import { config } from 'dotenv'
config()

// Legacy mode: APP_ID / APP_SECRET from the Reclaim Devtool (https://dev.reclaimprotocol.org/)
export const hasLegacyCredentials = Boolean(process.env.APP_ID && process.env.APP_SECRET)
// Builder mode: org token (rorg_...) from Reclaim Builder (https://build.reclaimprotocol.org)
export const hasBuilderCredentials = Boolean(process.env.RECLAIM_ORG_SECRET)

export const createLegacyClient = () =>
    new ReclaimClient(process.env.APP_ID!, process.env.APP_SECRET!)

export const createBuilderClient = (orgToken = process.env.RECLAIM_ORG_SECRET!) =>
    new ReclaimClient({
        orgToken,
        builderBaseUrl: process.env.BUILDER_BASE_URL || undefined,
    })

// A static, un-rate-limited JSON endpoint, so these tests exercise the auth
// modes rather than an upstream API's rate limits.
export const TODO_URL = "https://jsonplaceholder.typicode.com/todos/1"
export const TODO_TITLE = "delectus aut autem"

/** The same fetch in every mode, so both modes are compared like for like. */
export const getTodoWith = (client: ReclaimClient, contextMessage: string, retries = 2, useTee = false) =>
    client.zkFetch(
        TODO_URL,
        {
            method: "GET",
            context: {
                contextAddress: "0x0000000000000000000000000000000000000000",
                contextMessage,
            },
            useTee,
        },
        {
            responseMatches: [{
                type: 'regex' as const,
                value: '"title": "(?<title>[^"]*)"',
            }],
            responseRedactions: [{ regex: '"title": "(?<title>[^"]*)"' }],
        },
        // Absorb transient network/attestor failures. In Builder mode each
        // attempt requests (and is charged) its own authorization.
        retries,
        2000
    )
