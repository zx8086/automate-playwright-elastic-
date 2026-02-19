# Zod v4 Migration Guide

## Overview

This project has been upgraded from Zod v3.25.42 to v4.0.17, implementing comprehensive improvements across the configuration and validation system. This guide documents the migration process and the benefits realized.

## Key Improvements Applied

### 1. Performance Enhancements

Zod v4 provides significant performance improvements:

- **14x faster** string parsing
- **7x faster** array parsing
- **6.5x faster** object parsing
- **100x reduction** in TypeScript instantiations
- **2x smaller** core bundle size

### 2. Enhanced Configuration System (`config.ts`)

#### New Features Implemented

- **Custom Error Maps**: Improved error messages for better debugging
- **Template Literal Types**: Enhanced enum validation for environment, screenshot, video, and trace modes
- **Directory Path Validation**: Auto-creates directories if they don't exist
- **URL Validation**: Enforces HTTPS protocol with fallback to HTTP
- **Numeric Formats**: Integer validation with min/max constraints for better type safety
- **File Size Validation**: Enforces reasonable limits (1KB min, 1GB max)
- **Cross-Field Validation**: Ensures configuration integrity (e.g., different directories for screenshots/downloads/synthetics)

#### Environment Variable Improvements

- **StringBool Coercion**: Supports "true", "false", "1", "0" for boolean env vars
- **Type-Safe Coercion**: Automatic type conversion with validation
- **Comprehensive Validation**: All env vars validated before use
- **Quiet Mode**: dotenv configured with `quiet: true` to suppress output

### 3. Enhanced Schemas (`schemas.ts`)

#### Schema Improvements

- **ElementCountsSchema**: Non-negative integer validation with descriptions
- **BrokenLinkSchema**: HTTP status code validation (100-599), max string lengths
- **BrokenLinksReportSchema**: ISO datetime format, cross-field validation
- **NavigationPathSchema**: Min/max string lengths, default values
- **PageLoadOptionsSchema**: Sensible timeout defaults and constraints
- **PerformanceMetricsSchema**: Proper descriptions for all metrics

### 4. New Validation Features

#### Added Validations

- Viewport aspect ratio validation
- Download configuration cross-validation
- Extension format validation (must start with .)
- MIME type format validation
- Department short code auto-uppercase
- Domain name format (lowercase with hyphens only)

### 5. Schema Registry

Created a centralized schema registry for reusability:

```typescript
export const SchemaRegistry = {
  Server: ServerConfigSchema,
  Browser: BrowserConfigSchema,
  Download: DownloadConfigSchema,
  Config: ConfigSchema,
  BrokenLink: BrokenLinkSchema,
  BrokenLinksReport: BrokenLinksReportSchema,
  NavigationPath: NavigationPathSchema,
  ElementCounts: ElementCountsSchema,
} as const;
```

## Benefits Realized

### Development Experience

- **Better Error Messages**: Clear, actionable validation errors using `z.prettifyError()`
- **Type Safety**: Stronger TypeScript integration with automatic type inference
- **Auto-completion**: Enhanced IDE support with metadata
- **Fail-Fast**: Configuration errors caught at startup

### Runtime Performance

- Significantly faster configuration parsing
- Reduced memory footprint
- Faster test execution due to optimized validation

### Maintenance

- **Self-Documenting**: Schemas include descriptions
- **Centralized Validation**: All validation rules in one place
- **Extensible**: Easy to add new validation rules

## Breaking Changes Handled

- None - Zod v4 maintains backward compatibility
- All existing functionality preserved
- Enhanced with new features without breaking existing code

## Zod v4 API Changes

### Format Functions

Zod v4 introduces format functions for common patterns:

```typescript
// String formats
z.email()           // Email validation
z.url()             // URL validation
z.uuid()            // UUID validation

// Number formats
z.int32()           // 32-bit integer
z.float32()         // 32-bit float
z.int64()           // 64-bit integer

// Date/Time formats
z.iso.datetime()    // ISO 8601 datetime
z.iso.date()        // ISO 8601 date
z.iso.time()        // ISO 8601 time
```

### Error Handling

New error formatting with `z.prettifyError()`:

```typescript
const result = ConfigSchema.safeParse(data);
if (!result.success) {
  const prettyError = z.prettifyError(result.error);
  console.error(prettyError);
}
```

### Strict Objects

Use `z.strictObject()` for objects that should not accept extra keys:

```typescript
const ServerConfigSchema = z.strictObject({
  baseUrl: z.url(),
  environment: z.enum(['development', 'staging', 'production']),
});
```

## Migration Steps

If you're migrating a Zod v3 project to v4:

### 1. Update Dependency

```bash
bun add zod@latest
# or
npm install zod@latest
```

### 2. Replace Deprecated APIs

```typescript
// v3 (deprecated)
z.string().email()
z.string().url()

// v4 (preferred)
z.email()
z.url()
```

### 3. Update Number Validation

```typescript
// v3
z.number().int().min(0).max(100)

// v4 (more explicit)
z.int32().min(0).max(100)
```

### 4. Update Error Handling

```typescript
// v3
console.error(result.error.format())

// v4
console.error(z.prettifyError(result.error))
```

### 5. Use Strict Objects Where Appropriate

```typescript
// v3 (accepts extra keys by default)
z.object({ name: z.string() })

// v4 (strict mode for better validation)
z.strictObject({ name: z.string() })
```

## Testing

Configuration system tested and validated:

- All numeric validations working
- String format validations operational
- Coercion features functioning
- Cross-field validations active
- Metadata features accessible

Run validation tests:

```bash
bun run test
bun run typecheck
```

## Future Opportunities

With Zod v4, we can now:

1. **File Validation**: Add file validation for uploaded assets
2. **JSON Schema Export**: Export schemas for API documentation
3. **Zod Mini**: Use Zod Mini for client-side validation (tree-shakable)
4. **Recursive Validation**: Add recursive validation for nested configurations
5. **Conditional Schemas**: Implement conditional schemas based on environment
6. **Custom Formats**: Define custom format functions for domain-specific validation

## Example: Full Configuration Validation

```typescript
import { z } from "zod";

// Environment enum with strict values
const EnvironmentType = z.enum(["development", "staging", "production", "test"]);

// Server configuration with format validation
const ServerConfigSchema = z.strictObject({
  baseUrl: z.url(),
  screenshotDir: z.string().refine(
    (val) => val.startsWith("./") || val.startsWith("/"),
    { message: "Must be relative or absolute path" }
  ),
  environment: EnvironmentType,
  pauseBetweenClicks: z.int32().min(0).max(10000),
});

// Cross-field validation
const ConfigSchema = z.strictObject({
  server: ServerConfigSchema,
  browser: BrowserConfigSchema,
  allowedDownloads: DownloadConfigSchema,
}).superRefine((data, ctx) => {
  // Ensure directories are different
  if (data.server.screenshotDir === data.server.downloadsDir) {
    ctx.addIssue({
      code: "custom",
      path: ["server", "downloadsDir"],
      message: "Downloads directory must differ from screenshots directory",
    });
  }
});

// Usage
const result = ConfigSchema.safeParse(rawConfig);
if (!result.success) {
  console.error("Validation failed:");
  console.error(z.prettifyError(result.error));
  process.exit(1);
}

const config = result.data; // Fully typed Config object
```

## Conclusion

The migration to Zod v4 provides immediate performance benefits and opens up new possibilities for validation and type safety. The configuration system is now more robust, faster, and easier to maintain.

Key takeaways:

- Performance improvements are significant (7-14x faster parsing)
- New format functions simplify common validations
- Better error messages improve debugging experience
- Strict objects catch configuration errors earlier
- Schema registry enables code reuse across the project
