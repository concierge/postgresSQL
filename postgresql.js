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
    deasync = require('deasync'),
    path = require('path'),
    url = require('url');

let pool = null,
    config = {
        host: 'localhost',
        port: 0,
        max: 20,
        user: 'postgres',
        password: 'postgres',
        database: 'concierge'
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
            console.error($$ `database screwed up, error:"${error.message}"`);
        });

        let done = false,
            done2 = false;

        pool.connect((err, client, cb) => {
            if (err) {
                console.error($$ `database screwed up, error:"${err.message}"`);
                cb(err);
                done = true;
            }

            client.query('CREATE TABLE IF NOT EXISTS module (id text PRIMARY KEY, config json NOT NULL)', (err, res) => {
                cb();
                if (err) {
                    console.error($$ `database screwed up, error:"${err.message}"`);
                }
                done = true;
            });

            client.query('CREATE INDEX IF NOT EXISTS id_index ON module (id)', (err, res) => {
                cb();
                if (err) {
                    console.error($$ `database screwed up, error:"${err.message}"`);
                }
                done = true;
            });

        });

        global.currentPlatform.config.setInterceptor(this);
        deasync.loopWhile(() => { return !done && !done2; });
    }

    _pathFromDescriptor(descriptor) {
        if (descriptor === global.currentPlatform.config.getGlobalIndicator()) {
            return global.__runAsLocal ? global.rootPathJoin('') : global.__modulesPath;
        } else {
            if (!descriptor.folderPath) {
                descriptor.folderPath = path.join(global.__modulesPath, descriptor.name);
            }
            return descriptor.folderPath;
        }
    }

    unload() {
        pool.end();
        global.currentPlatform.config.setInterceptor(this);
    }

    loadConfig(descriptor) {
        descriptor = this._pathFromDescriptor(descriptor);

        let done = false,
            output = {};

        pool.connect((err, client, cb) => {
            if (err) {
                console.error($$ `database screwed up, error:"${err.message}"`);
                cb(err);
                done = true;
            }

            client.query(SQL `SELECT config FROM module WHERE id = ${descriptor}`, (err, res) => {
                cb();
                if (err) {
                    console.error($$ `database screwed up, error:"${err.message}"`);
                    done = true;
                }
                if (res.rows.length === 0) {
                    done = true;
                } else if (res.rows.length === 1) {
                    output = res.rows[0];
                    done = true;
                } else {
                    console.error($$ `The number of rows returned for the query: "${res.command}", was greater than 1`);
                    done = true;
                }
            });

        });

        deasync.loopWhile(() => { return !done; });
        return output;
    }

    saveConfig(descriptor, config) {
        descriptor = this._pathFromDescriptor(descriptor);
        const data = JSON.stringify(config, (key, value) => {
            // deliberate use of undefined, will cause property to be deleted.
            return value === null || typeof value === 'object' && Object.keys(value).length === 0 ? void(0) : value;
        }, 4);
        if (!!data && data !== 'undefined') { // there is data to write
            let done = false;
            pool.connect((err, client, cb) => {
                if (err) {
                    console.error($$ `database screwed up, error:"${err.message}"`);
                    cb(err);
                    done = true;
                }

                client.query(SQL `INSERT INTO module (id, config) VALUES (${descriptor}, ${data}) ON CONFLICT (id) DO UPDATE SET config = ${data}`, (err, res) => {
                    cb();
                    done = true;
                });
            });
            deasync.loopWhile(() => { return !done; });
        }


    }
}

module.exports = new PostgreSQLService();