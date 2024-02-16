/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */


export type OnChanged = () => void;

export abstract class Configuration {

    abstract configure(): void;

    abstract getString(): string;

    private readonly listeners: OnChanged[] = [];

    onChanged(listener: OnChanged) {
        this.listeners.push(listener);
    }

    protected notifyChanged() {
        for (const listener of this.listeners) {
            listener();
        }
    }

}

export class WhenStartedConfiguration extends Configuration {
    
    configure(): void {
        console.log('>>> Configure WhenStartedConfiguration...')
    }

    getString(): string {
        return 'do nothing';
    }

}

export class CpuSamplerFilterConfiguration extends Configuration {
    
    configure(): void {
        console.log('>>> Configure CpuSamplerFilterConfiguration...')
    }

    getString(): string {
        return 'include all classes';
    }

}

export class CpuSamplerSamplingRateConfiguration extends Configuration {
    
    configure(): void {
        console.log('>>> Configure CpuSamplerSamplingRateConfiguration...')
    }

    getString(): string {
        return '20 ms';
    }

}

export class MemorySamplerSamplingRateConfiguration extends Configuration {
    
    configure(): void {
        console.log('>>> Configure MemorySamplerSamplingRateConfiguration...')
    }

    getString(): string {
        return '1.000 ms';
    }

}

export class JfrSettingsConfiguration extends Configuration {
    
    configure(): void {
        console.log('>>> Configure JfrSettingsConfiguration...')
    }

    getString(): string {
        return 'default';
    }

}
