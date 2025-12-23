/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Cartridge Controller loads WASM in an iframe from x.cartridge.gg
      // DO NOT enable WASM support in webpack - it interferes with their iframe loading
      // Their WASM is loaded directly in the iframe, not through webpack bundling
      
      // Exclude WASM files from webpack processing entirely
      // This prevents webpack from trying to process WASM files from node_modules
      config.module.rules.push({
        test: /\.wasm$/,
        type: 'asset/resource', // Treat as static asset, don't process with webpack
        exclude: /node_modules/, // Exclude all node_modules WASM files
      });

      // Resolve fallbacks for Node.js modules (for other dependencies)
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };

      // Ignore any WASM-related warnings/errors from Cartridge Controller
      // Their WASM loads in iframe from their domain, not through webpack
      config.ignoreWarnings = [
        ...(config.ignoreWarnings || []),
        { module: /node_modules\/@cartridge\/controller/ },
        { message: /RuntimeError/ },
        { message: /WASM/ },
        { message: /\.wasm/ },
      ];
    }

    return config;
  },
}

module.exports = nextConfig

