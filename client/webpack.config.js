'use strict';

const path = require('path');


module.exports = function () {
  var entry = path.resolve(__dirname, './index.js');
  console.log(path.resolve(__dirname, './dist/'));
  return {
    watch: false,
    mode: 'production',
    devtool: false,
    entry,
    output: {
      path: path.resolve(__dirname, './dist/'),
      filename: path.basename(entry).replace(/\.ts$/, '.js'),
      library: 'turbo_wired',
    },
    resolve: {
      // Add `.ts` as a resolvable extension.
      extensions: ['.ts', '.js'],
    },
    // module: {
    //   rules: [
    //     // all files with a `.ts`
    //     { test: /\.ts$/, loader: 'ts-loader' },
    //   ],
    // },
  };
};
