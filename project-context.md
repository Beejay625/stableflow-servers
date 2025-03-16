# StableFlow Backend Project Context

## Project Overview

StableFlow Backend is a NestJS application with multiple modules:
- Business Module
- Paycrest Module
- Auth Module
- Redis Module
- Queue Module
- Database Module

## Previous Issues and Fixes

1. **Database Connection Error**: 
   - Error: `Entity metadata for Business#category was not found`
   - Root cause: Circular dependency between Business and Category entities
   - Fixed by using string-based references in entity relationships
   - Removed redundant export of Category entity that was causing TypeScript errors

2. **Compilation Error**: 
   - Error: `Cannot find module '/dist/main'`
   - Fixed by adding proper build script to package.json
   - Successfully generated dist files with `yarn build`

3. **TypeScript Errors**:
   - `Cannot redeclare exported variable 'Category'`
   - `Cannot find name 'CategoryEntity'`
   - Fixed by removing the redundant export statement in category.entity.ts

## Current Status

- ✅ Module structure is correct
- ✅ Entity relationships are properly defined with string references
- ✅ Business controller is correctly registered
- ✅ Category entity export issues resolved
- ✅ Application builds successfully
- ✅ Server starts correctly

## Module Dependencies

The Business module depends on the Paycrest module for:
- Bank account verification
- Currency listing
- Financial institution listing

Paycrest is integrated via the `registerFromEnv()` method which loads configuration from environment variables.

## Module Structure

### Business Module
- **Entities**: Business, Category
- **Controller**: BusinessController
- **Service**: BusinessService
- **Dependencies**: PaycrestModule

### Paycrest Module
- Provides financial services integration
- Acts as a standalone module loaded via environment configuration
- Exports PaycrestService for use in other modules

## Implemented Entity Relationships

### Business Entity
```typescript
@ManyToOne('Category', (category: any) => category.businesses)
@JoinColumn({ name: 'category_id' })
category: any;
```

### Category Entity
```typescript
@OneToMany('Business', (business: any) => business.category)
businesses: any[];
```

This approach avoids circular dependencies by using string-based references. 