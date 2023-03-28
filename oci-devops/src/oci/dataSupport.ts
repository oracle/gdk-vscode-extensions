/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */


export interface DataProducer {

    getDataName(): string;

    getData(): any | undefined;

}

export type DataChanged = (dataProducer?: DataProducer) => void;

export function isDataProducer(object: any) {
    return typeof object.getDataName === 'function' && typeof object.getData === 'function';
}

export function getDataProducer(object: any): DataProducer | undefined {
    if (isDataProducer(object)) {
        return object as any as DataProducer;
    }
    return undefined;
}
