import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import { fileURLToPath } from 'url';
import { ValidationUtils } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure storage
const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    // Store uploads in uploads/products directory
    const uploadPath = path.join(__dirname, '../../uploads/products');
    cb(null, uploadPath);
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    // Generate secure unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    // Sanitize original filename
    const sanitizedName = file.originalname
      .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
      .substring(0, 50); // Limit length
    
    cb(null, 'product-' + uniqueSuffix + fileExtension);
  }
});

// File filter for images only
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Validate file using security utils
  const validation = ValidationUtils.validateFileUpload(file);
  
  if (!validation.isValid) {
    logger.warn('File upload rejected:', {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      errors: validation.errors
    });
    
    cb(new Error(validation.errors[0] || 'Invalid file'));
    return;
  }

  // Additional MIME type check
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    logger.info('File upload accepted:', {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    cb(null, true);
  } else {
    logger.warn('File upload rejected - invalid MIME type:', {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    cb(new Error('Only image files (JPEG, PNG, WebP, GIF) are allowed'));
  }
};

// Configure multer
export const productImageUpload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1, // Only one file at a time
    fields: 10, // Limit form fields
    fieldNameSize: 100, // Limit field name size
    fieldSize: 1024 * 1024, // 1MB per field
  },
  fileFilter: fileFilter,
  preservePath: false // Prevent directory traversal
});

// Single file upload middleware for product images
export const uploadProductImage = productImageUpload.single('image');