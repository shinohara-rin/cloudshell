### Backend

- bzip2-devel

Might need to symbol link `/usr/lib64/libbz2.so.1.0` to `/usr/lib64/libbz2.so.1.0.x`, where `x` is the actuall version on your system.

#### Update CheriBSD Image

```bash
cd backend
NODE_ENV=production node image-manager.js
```
