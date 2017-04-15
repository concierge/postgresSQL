/**
 * Manages the loading and saving of configuration data to a PostgreSQL database.
 *
 * Written By:
 *              Dion Woolley
 *
 * License:
 *              MIT License. All code unless otherwise specified is
 *              Copyright (c) Matthew Knox and Contributors 2016.
 */

const Pool = require('pg-pool'),
    SQL = require('sql-template-strings'),
    url = require('url');

let pool = null,
    config = {
        host: 'localhost',
        port: 0,
        max: 20
    };

class PostgreSQLService {
    load() {
        if (process.env.DATABASE_URL) {
            const params = url.parse(process.env.DATABASE_URL),
                auth = params.auth.split(':');

            config.host = params.hostname;
            config.port = params.port;
            config.ssl = true;
            config.user = auth[0];
            config.password = auth[1];
            config.database = params.pathname.split('/')[1];
        }

        pool = new Pool(config);
        pool.on('error', (error, client) => {
            console.error($$`database screwed up, error:"${error.message}"`);
        });

        pool.connect().then(client => {
            client.query('CREATE TABLE IF NOT EXISTS module (id text PRIMARY KEY, config json NOT NULL)').then(res => {
                    client.release();
                })
                .catch(e => {
                    client.release();
                    console.error($$`database screwed up, error:"${e.message}"`);
                });

            client.query('CREATE INDEX id_index ON module (id)').then(res => {
                    client.release();
                })
                .catch(e => {
                    client.release();
                    console.error($$`database screwed up, error:"${e.message}"`);
                });
        });
        global.currentPlatform.config.setInterceptor(this);
    }

    unload() {
        pool.end();
        global.currentPlatform.config.setInterceptor(this);
    }

    loadConfig(descriptor) {
        pool.connect().then(client => {
            client.query(SQL`SELECT config FROM module WHERE id = ${descriptor.folderPath}`).then(res => {
                    client.release();
                    if (res.rows.length === 0) {
                        return {};
                    } else if (res.rows.length === 1) {
                        return JSON.parse(res.rows[0]);
                    } else {
                        console.error($$`The number of rows returned for the query: "${res.command}", was greater than 1`);
                    }
                })
                .catch(e => {
                    client.release();
                    console.error($$`database screwed up, error:"${e.message}"`);
                });
        });
    }

    saveConfig(descriptor, config) {
        const data = JSON.stringify(config, (key, value) => {
            // deliberate use of undefined, will cause property to be deleted.
            return value === null || typeof value === 'object' && Object.keys(value).length === 0 ? void(0) : value;
        }, 4);
        if (!!data && data !== 'undefined') { // there is data to write
            pool.connect().then(client => {
                client.query(SQL`INSERT INTO module (id, config) VALUES (${descriptor.folderpath}, ${data}) ON CONFLICT (id) DO UPDATE SET config = ${data}`).then(res => {
                        client.release();
                    })
                    .catch(e => {
                        client.release();
                        console.error($$`database screwed up, error:"${e.message}"`);
                    });
            });
        }
    }
}

module.exports = new PostgreSQLService();