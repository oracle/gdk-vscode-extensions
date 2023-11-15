/*
 * Copyright 2023 Oracle and/or its affiliates
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     https://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.example.service;

import io.micrometer.core.annotation.Timed;
import io.micrometer.core.instrument.MeterRegistry;
import io.micronaut.scheduling.annotation.Scheduled;
import jakarta.inject.Singleton;

import java.lang.management.ManagementFactory;
import java.lang.management.ThreadMXBean;
import java.util.Random;
import java.util.concurrent.atomic.AtomicLong;

@Singleton
public class MetricsService {

    private final AtomicLong threadCount = new AtomicLong();
    private final ThreadMXBean threadMXBean;
    private final Random random = new Random();

    MetricsService(MeterRegistry meterRegistry) {
        threadMXBean = ManagementFactory.getThreadMXBean();
        threadCount.set(threadMXBean.getThreadCount());
        meterRegistry.gauge("custom.thread.count.value", threadCount);
    }

    @Scheduled(fixedRate = "${custom.thread.count.updateFrequency:15s}",
            initialDelay = "${custom.thread.count.initialDelay:0s}")
    @Timed("custom.thread.count.time")
    public void refreshThreadCount() throws InterruptedException {
        threadCount.set(threadMXBean.getThreadCount());
        // do something that takes time
        Thread.sleep(random.nextInt(501));
    }
}
