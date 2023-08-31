/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

//@ts-check
/* eslint-disable @typescript-eslint/naming-convention */

'use strict';

const path = require('path');
const webpack = require('webpack');
const ESLintPlugin = require('eslint-webpack-plugin');

/**@type {import('webpack').Configuration}*/
const config = {
    target: 'node', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/

    entry: {
        extension: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
    },
    output: { // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        libraryTarget: "commonjs2",
        devtoolModuleFilenameTemplate: "../[resource-path]",
    },
    devtool: 'source-map',
    externals: {
        vscode: "commonjs2 vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    },
    resolve: { // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
        extensions: ['.ts', '.js', '.json'],
        modules: ['node_modules'],
        mainFields: ['main', 'module'],
        byDependency: {
            'node-fetch': {
                mainFields: ['main', 'module']
            },
            'isomorphic-fetch': {
                mainFields: ['main', 'module']
            }
        }
    },
    module: {
        rules: [{
            test: /\.ts$/,
            exclude: /node_modules/,
            include: path.resolve(__dirname, 'src'),
            use: [{
                loader: 'ts-loader'
            }]
        }]
    },
    plugins: [
        new ESLintPlugin({extensions: ['ts']})
    ],
};
const devConf = {
    target: 'node', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/

    entry: {
        extension: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
    },
    output: { // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        libraryTarget: "commonjs2",
        devtoolModuleFilenameTemplate: "../[resource-path]",
    },
    devtool: 'source-map',
    externals: {
        vscode: "commonjs2 vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    },
    resolve: { // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
        extensions: ['.ts', '.js', '.json'],
        modules: ['node_modules'],
        mainFields: ['main', 'module'],
        byDependency: {
            'node-fetch': {
                mainFields: ['main', 'module']
            },
            'isomorphic-fetch': {
                mainFields: ['main', 'module']
            }
        },
        symlinks: false,
        cacheWithContext: false,
    },
    module: {
        rules: [{
            test: /\.ts$/,
            exclude: /node_modules/,
            include: path.resolve(__dirname, 'src'),
            use: [{
                loader: 'ts-loader',
                options: {
                    transpileOnly: true, // https://github.com/TypeStrong/ts-loader#faster-builds
                }
            }]
        }],
        noParse: path.resolve(__dirname, 'lib', 'gcn.ui.api.js')
    },
    optimization: { 
        minimize: false
    },
    plugins: [
        new webpack.AutomaticPrefetchPlugin()
    ],
    cache: {
        type: 'filesystem',
        buildDependencies: {
            // This makes all dependencies of this file - build dependencies
            config: [__filename],
            // By default webpack and loaders are build dependencies
        },
    },
};

//Browser webpack configuration, 📖 -> https://code.visualstudio.com/api/extension-guides/web-extensions#webpack-configuration
const commonWebConfig = {
    target:'webworker',
    entry: {
        webExtension: './src/browser/extension.ts',
    },
    plugins:(config.plugins || []).concat(
        new webpack.ProvidePlugin({
        process: 'process/browser' // provide a shim for the global `process` variable
        })
    ),
};

const webConfig = Object.assign({},config,commonWebConfig);
const devWebConfig = Object.assign({},devConf,commonWebConfig);

// https://webpack.js.org/configuration/mode/#mode-none
module.exports = (env, argv) => {
    if (argv.mode === 'development') {
        return [devConf, devWebConfig];
    }

    if (argv.mode === 'production') {
        return [config, webConfig];
    }
    return [config, webConfig];
};
