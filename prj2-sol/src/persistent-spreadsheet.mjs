import AppError from './app-error.mjs';
import MemSpreadsheet from './mem-spreadsheet.mjs';

//use for development only
import { inspect } from 'util';

import mongo from 'mongodb';

//use in mongo.connect() to avoid warning
const MONGO_CONNECT_OPTIONS = { useUnifiedTopology: true };
/**
 * User errors must be reported by throwing a suitable
 * AppError object having a suitable message property
 * and code property set as follows:
 *
 *  `SYNTAX`: for a syntax error.
 *  `CIRCULAR_REF` for a circular reference.
 *  `DB`: database error.
 */

/** Declaring variables for global usage*/
var db;
var ss_name;
var spreadsheet;
const mem = new MemSpreadsheet();

export default class PersistentSpreadsheet {
  //factory method for mongogb Connection
  static async make(dbUrl, spreadsheetName) {
    let client;
    try {
      client = await mongo.connect(dbUrl,MONGO_CONNECT_OPTIONS);
    }
    catch (err) {
      const msg = `cannot connect to URL "${dbUrl}": ${err}`;
      throw new AppError('DB', msg);
    }
    db = client.db();
    ss_name = spreadsheetName;
    spreadsheet = db.collection(spreadsheetName);
    return new PersistentSpreadsheet(client,db,spreadsheet);
  }

  constructor(client,db) {
    this.client = client;
    this.db = db;
    this.spreadsheetName = ss_name;
    this.spreadsheet = spreadsheet;
  }

  /** Release all resources held by persistent spreadsheet.
   *  Specifically, close any database connections.
   */
  async close() {
    await this.client.close();
  }

  /** Set cell with id baseCellId to result of evaluating string
   *  formula.  Update all cells which are directly or indirectly
   *  dependent on the base cell.  Return an object mapping the id's
   *  of all dependent cells to their updated values.
   */
  async eval(baseCellId, formula) {
    const results = mem.eval(baseCellId,formula);
    const value = Object.values(results)[0];
    const options = {upsert:true} // Set upsert to true to create a entry if not already exists
    try {
      await db.collection(ss_name).updateOne({[baseCellId]:{'$exists': 1}},{$set:{[baseCellId]:value,'formula':formula}},options); //Querying to update database with updated values
    }
    catch (err) {
      mem.undo();
      const msg = `cannot update "${baseCellId}: ${err}`;
      throw new AppError('DB', msg);
    }
    return results;
  }

  /** return object containing formula and value for cell cellId
   *  return { value: 0, formula: '' } for an empty cell.
   */
  async query(cellId) {

    const res = mem.query(cellId);
    const cell = await db.collection(ss_name).findOne({[cellId]: {'$exists': 1}});  // querying db to find cell_id
    if (cell) {
      delete cell._id;
      const temp = Object.values(cell);
      let form = String(temp[1]);
      const formula = form.replace(/\s+/g, '');
      const result = {
        formula: formula,
        value: temp[0]
      }
      return result;
    } else {
      return {'formula': '', 'value': 0}    //return value 0 if cell_id not present
    }

  }

  /** Clear contents of this spreadsheet */
  async clear() {
    try {
      await db.collection(ss_name).deleteMany({});  // mongodb query to clear the spreadsheet
    } catch (err) {
      const msg = `cannot drop collection ${this.spreadsheetName}: ${err}`;
      throw new AppError('DB', msg);
    }

    await mem.clear();
  }

  /** Delete all info for cellId from this spreadsheet. Return an
   *  object mapping the id's of all dependent cells to their updated
   *  values.
   */
  async delete(cellId) {
    let results;
    results = mem.delete();
    try {
      await db.collection(ss_name).deleteOne({[cellId]: {'$exists': 1}});  // mongodb query to delete a particular cell
    }
    catch (err) {
      mem.undo();
      const msg = `cannot delete ${cellId}: ${err}`;
      throw new AppError('DB', msg);
    }
    return results;
  }

  /** copy formula from srcCellId to destCellId, adjusting any
   *  relative cell references suitably.  Return an object mapping the
   *  id's of all dependent cells to their updated values. Copying
   *  an empty cell is equivalent to deleting the destination cell.
   */
  async copy(destCellId, srcCellId) {
    const srcFormula = /* @TODO get formula by querying mem-spreadsheet */ '';
    if (!srcFormula) {
      return await this.delete(destCellId);
    }
    else {
      const results = mem.copy();
      try {
	//@TODO
      }
      catch (err) {
	mem.undo();
	const msg = `cannot update "${destCellId}: ${err}`;
	throw new AppError('DB', msg);
      }
      return results;
    }
  }

  /** Return dump of cell values as list of cellId and formula pairs.
   *  Do not include any cell's with empty formula.
   *
   *  Returned list must be sorted by cellId with primary order being
   *  topological (cell A < cell B when B depends on A) and secondary
   *  order being lexicographical (when cells have no dependency
   *  relation).
   *
   *  Specifically, the cells must be dumped in a non-decreasing depth
   *  order:
   *
   *    + The depth of a cell with no dependencies is 0.
   *
   *    + The depth of a cell C with direct prerequisite cells
   *      C1, ..., Cn is max(depth(C1), .... depth(Cn)) + 1.
   *
   *  Cells having the same depth must be sorted in lexicographic order
   *  by their IDs.
   *
   *  Note that empty cells must be ignored during the topological
   *  sort.
   */
  async dump() {

    return mem.dump();
  }

}

