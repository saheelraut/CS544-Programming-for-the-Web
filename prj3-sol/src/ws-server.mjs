import assert from 'assert';
import cors from 'cors';
import express from 'express';
import bodyParser from 'body-parser';

import {AppError} from 'cs544-ss';

/** Storage web service for spreadsheets.  Will report DB errors but
 *  will not make any attempt to report spreadsheet errors like bad
 *  formula syntax or circular references (it is assumed that a higher
 *  layer takes care of checking for this and the inputs to this
 *  service have already been validated).
 */

//some common HTTP status codes; not all codes may be necessary
const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVER_ERROR = 500;

export default function serve(port, ssStore) {
  const app = express();
  app.locals.port = port;
  app.locals.ssStore = ssStore;
  setupRoutes(app);
  app.listen(port, function() {
    console.log(`listening on port ${port}`);
  });
}

const CORS_OPTIONS = {
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  preflightContinue: false,
  optionsSuccessStatus: 204,
  exposedHeaders: 'Location',
};

const BASE = 'api';
const STORE = 'store';


function setupRoutes(app) {
  const ssStore = app.locals.ssStore;
  app.use(cors(CORS_OPTIONS));  //needed for future projects
  app.use(bodyParser.json());
  app.get('/api/store/:id',doList(app));
  app.put('/api/store/:id',doReplace(app));
  app.put('/api/store/:id/:cellid',doReplace(app));
  app.patch('/api/store/:id',doUpdate(app));
  app.patch('/api/store/:id/:cellid',doUpdate(app));
  app.delete('/api/store/:id',doDelete(app));
  app.delete('/api/store/:id/:cellid',doDeleteCell(app));
  app.use(do404(app));  //default handler
  app.use(doErrors(app));
}

/****************************** Handlers *******************************/


/* Retrieve all spreadsheet data */
function doList(app) {
  return (async function (req, res) {
    const ssname = req.params.id;
    try {
      const results = await app.locals.ssStore.readFormulas(ssname);
      res.json(results);
    } catch (err) {
      const mapped = mapError(err);
      res.status(mapped.status).json(mapped);
    }
  });
}

/* Replace all spreadsheet data or SpreadSheet Cell with 400 error handling*/

function doReplace(app) {
  return (async function (req, res) {
    const ssname = req.params.id;
    try {
      const replacement = Object.assign({}, req.body);
      if (req.params.cellid) {
        if (req.body.formula === undefined || req.body.formula === null) {
          res.status(400).send({
            "error": {
              "code": "BAD_REQUEST",
              "message": "request body must be a { formula } object"
            },
            "status": 400
          })
        } else {
          const results = await app.locals.ssStore.updateCell(ssname, req.params.cellid, replacement.formula);
        }

      } else {
        const res = await app.locals.ssStore.clear(ssname);
        for (const [key, value] of Object.entries(replacement)) {
          const results = await app.locals.ssStore.updateCell(ssname, value[0], value[1]);
        }

      }
      res.sendStatus(CREATED).end();

    } catch (err) {
      const mapped = mapError(err);
      res.status(mapped.status).json(mapped);
    }
  });
}

/* Update all spreadsheet data or Cell with 400 error handling*/

function doUpdate(app) {
  return (async function (req, res) {
    try {
      const ssname = req.params.id;
      const patch = Object.assign({}, req.body);
      if (req.params.cellid) {
        if (req.body.formula === undefined || req.body.formula === null) {
          res.status(400).send({
            "error": {
              "code": "BAD_REQUEST",
              "message": "request body must be a { formula } object"
            },
            "status": 400
          })

        } else {
          const results = app.locals.ssStore.updateCell(ssname, req.params.cellid, patch.formula);
        }

      } else {
        for (const [key, value] of Object.entries(patch)) {
          const results = app.locals.ssStore.updateCell(ssname, value[0], value[1]);
        }
      }

      res.status(NO_CONTENT).end();
    } catch (err) {
      const mapped = mapError(err);
      res.status(mapped.status).json(mapped);
    }
  });
}

/* Clear spreadsheet*/

function doDelete(app) {
  return (async function(req, res) {
    try {
      const ssName = req.params.id;
      const results = await app.locals.ssStore.clear(ssName);
      res.status(NO_CONTENT).end();
    }
    catch(err) {
      const mapped = mapError(err);
      res.status(mapped.status).json(mapped);
    }
  });
}

/* Delete specified cell */

function doDeleteCell(app) {
  return (async function(req, res) {
    try {
      const ssName = req.params.id;
      const cellid = req.params.cellid;
      const results = await app.locals.ssStore.delete(ssName,cellid);
      res.status(NO_CONTENT).end();
    }
    catch(err) {
      const mapped = mapError(err);
      res.status(mapped.status).json(mapped);
    }
  });
}


/** Default handler for when there is no route cfor a particular method
 *  and path.
 */
function do404(app) {
  return async function(req, res) {
    const message = `${req.method} not supported for ${req.originalUrl}`;
    const result = {
      status: NOT_FOUND,
      error: { code: 'NOT_FOUND', message, },
    };
    res.status(404).
	json(result);
  };
}


/** Ensures a server error results in nice JSON sent back to client
 *  with details logged on console.
 */ 
function doErrors(app) {
  return async function(err, req, res, next) {
    const result = {
      status: SERVER_ERROR,
      error: { code: 'SERVER_ERROR', message: err.message },
    };
    res.status(SERVER_ERROR).json(result);
    console.error(err);
  };
}


/*************************** Mapping Errors ****************************/

const ERROR_MAP = {
}

/** Map domain/internal errors into suitable HTTP errors.  Return'd
 *  object will have a "status" property corresponding to HTTP status
 *  code and an error property containing an object with with code and
 *  message properties.
 */
function mapError(err) {
  const isDomainError = (err instanceof AppError);
  const status =
    isDomainError ? (ERROR_MAP[err.code] || BAD_REQUEST) : SERVER_ERROR;
  const error = 
	isDomainError
	? { code: err.code, message: err.message } 
        : { code: 'SERVER_ERROR', message: err.toString() };
  if (!isDomainError) console.error(err);
  return { status, error };
} 

/****************************** Utilities ******************************/



/** Return original URL for req */
function requestUrl(req) {
  const port = req.app.locals.port;
  return `${req.protocol}://${req.hostname}:${port}${req.originalUrl}`;
}
