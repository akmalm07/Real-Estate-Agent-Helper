import { Router } from 'express';
import { db } from '../../db/index.js';
import { properties } from '../../db/schema.js';
import { eq, desc, ne, and, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

const VALID_STATUSES = ['draft', 'open', 'archived', 'pending_deletion'];
const VALID_SOURCES  = ['zillow', 'realtor', 'referral', 'unknown'];

// GET /api/properties
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(properties)
      .where(and(eq(properties.userId, req.user.id), ne(properties.status, 'pending_deletion')))
      .orderBy(
        sql`CASE WHEN ${properties.status} = 'archived' THEN 1 ELSE 0 END`,
        desc(properties.createdAt)
      );
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/properties error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/properties
router.post('/', requireAuth, async (req, res) => {
  try {
    const { addressLine1, addressLine2, description, status, source, externalId, price, bedrooms, bathrooms, sqft } = req.body ?? {};

    if (!addressLine1?.trim()) return res.status(400).json({ error: 'addressLine1 is required.' });
    if (!description?.trim())  return res.status(400).json({ error: 'description is required.' });

    const validCreateStatuses = ['draft', 'open', 'archived'];
    if (!validCreateStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validCreateStatuses.join(', ')}` });
    }

    const resolvedSource = ['zillow', 'realtor', 'listing'].includes(source) ? source : 'listing';

    if (price     != null && price     !== '' && (isNaN(Number(price))     || Number(price)     < 0)) return res.status(400).json({ error: 'price must be a non-negative number.' });
    if (bedrooms  != null && bedrooms  !== '' && (isNaN(Number(bedrooms))  || Number(bedrooms)  < 0 || !Number.isInteger(Number(bedrooms))))  return res.status(400).json({ error: 'bedrooms must be a non-negative integer.' });
    if (bathrooms != null && bathrooms !== '' && (isNaN(Number(bathrooms)) || Number(bathrooms) < 0)) return res.status(400).json({ error: 'bathrooms must be a non-negative number.' });
    if (sqft      != null && sqft      !== '' && (isNaN(Number(sqft))      || Number(sqft)      < 0 || !Number.isInteger(Number(sqft))))       return res.status(400).json({ error: 'sqft must be a non-negative integer.' });

    const toStr = (v) => (v != null && v !== '' ? String(Number(v)) : null);
    const toInt = (v) => (v != null && v !== '' ? Number(v)         : null);

    const [newProperty] = await db.insert(properties).values({
      userId:       req.user.id,
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2?.trim() || null,
      description:  description.trim(),
      status,
      source:       resolvedSource,
      externalId:   externalId?.trim() || null,
      price:        toStr(price),
      bedrooms:     toInt(bedrooms),
      bathrooms:    toStr(bathrooms),
      sqft:         toInt(sqft),
    }).returning();

    return res.status(201).json(newProperty);
  } catch (err) {
    console.error('POST /api/properties error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/properties/:id
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const propertyId = Number(req.params.id);

    const [existing] = await db
      .select()
      .from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.userId, req.user.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Property not found.' });

    const { addressLine1, addressLine2, description, status, source, externalId, price, bedrooms, bathrooms, sqft } = req.body ?? {};
    const updates = {};

    if (addressLine1 !== undefined) updates.addressLine1 = addressLine1?.trim() || existing.addressLine1;
    if (addressLine2 !== undefined) updates.addressLine2 = addressLine2?.trim() || null;
    if (description  !== undefined) updates.description  = description?.trim()  || existing.description;
    if (externalId   !== undefined) updates.externalId   = externalId?.trim()   || null;

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      updates.status = status;
      if (status === 'pending_deletion') {
        const deletionDate = new Date();
        deletionDate.setDate(deletionDate.getDate() + 30);
        updates.deletionDate = deletionDate;
      }
    }

    if (source !== undefined) {
      if (!VALID_SOURCES.includes(source)) {
        return res.status(400).json({ error: `source must be one of: ${VALID_SOURCES.join(', ')}` });
      }
      updates.source = source;
    }

    // Numeric field helper: set to null when explicitly cleared, validate otherwise
    const applyNumeric = (key, val, isInt) => {
      if (val === null || val === '') { updates[key] = null; return; }
      if (val === undefined) return;
      const n = Number(val);
      if (isNaN(n) || n < 0 || (isInt && !Number.isInteger(n))) {
        throw Object.assign(new Error(`${key} is invalid`), { statusCode: 400, field: key });
      }
      updates[key] = isInt ? n : String(n);
    };

    try {
      applyNumeric('price',     price,     false);
      applyNumeric('bedrooms',  bedrooms,  true);
      applyNumeric('bathrooms', bathrooms, false);
      applyNumeric('sqft',      sqft,      true);
    } catch (fieldErr) {
      if (fieldErr.statusCode === 400) {
        return res.status(400).json({ error: `${fieldErr.field} value is invalid.` });
      }
      throw fieldErr;
    }

    const [updated] = await db
      .update(properties)
      .set(updates)
      .where(eq(properties.id, propertyId))
      .returning();

    return res.json(updated);
  } catch (err) {
    console.error('PATCH /api/properties/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
