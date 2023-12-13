/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

export function formatPercent(value: number): string {
    const proc = Math.round(value * 100);
    return `${proc}%`;
}

export function formatTime(seconds: number): string {
    var result = '';
    const days = Math.floor(seconds / (3600 * 24));
    if (days) result += `${days.toLocaleString()} d `;
    seconds -= days * 3600 * 24;
    const hours = Math.floor(seconds / 3600);
    if (days || hours) result += `${hours} h `;
    seconds -= hours * 3600;
    const minutes = Math.floor(seconds / 60);
    if (days || hours || minutes) result += `${minutes} m `;
    seconds  -= minutes * 60;
    result += `${seconds} s`;
    return result;
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes.toLocaleString()} B`;
    }
    const kilobytes = Math.round(bytes / 1024);
    if (kilobytes < 1024) {
        return `${kilobytes.toLocaleString()} KB`;
    }
    const megabytes = Math.round(kilobytes / 1024);
    if (megabytes < 1024) {
        return `${megabytes.toLocaleString()} MB`;
    }
    const gigabytes = Math.round(megabytes / 1024);
    if (gigabytes < 1024) {
        return `${gigabytes.toLocaleString()} GB`;
    }
    const terabytes = Math.round(gigabytes / 1024);
    return `${terabytes.toLocaleString()} TB`;
}
