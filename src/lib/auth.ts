import { db } from '../db/index';
import { createAuth } from './create-auth';

export const auth = createAuth(db);
