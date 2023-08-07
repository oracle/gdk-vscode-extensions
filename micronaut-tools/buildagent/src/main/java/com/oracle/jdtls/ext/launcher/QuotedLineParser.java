/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

package com.oracle.jdtls.ext.launcher;

import java.util.ArrayList;
import java.util.List;

/**
 *
 * @author sdedic
 */
class QuotedLineParser {
    
    final String ql;
    List<String> res = new ArrayList<>();
    StringBuilder accumulated = new StringBuilder();
    boolean quote = false;
    boolean hash = false;
    boolean continuation = false;
    boolean wasNewline = false;
    boolean nonEmpty = false;
    int startAt = -1;
    int i = 0;

    public QuotedLineParser(String ql) {
        this.ql = ql;
    }

    void endParameter() {
        accumulate();
        if (accumulated.length() > 0 || nonEmpty) {
            res.add(accumulated.toString());
        }
        nonEmpty = false;
        accumulated = new StringBuilder();
        startAt = -1;
    }

    void accumulate() {
        if (startAt >= 0 && (startAt < i || nonEmpty)) {
            accumulated.append(ql.substring(startAt, i));
            wasNewline = false;
        }
        startAt = -1;
    }

    void accumulateWith(char c) {
        accumulate();
        accumulated.append(c);
        wasNewline = false;
    }

    void text() {
        if (startAt == -1) {
            startAt = i;
        }
    }

    List<String> parseQuotedList() {
        for (; i < ql.length(); i++) {
            char c = ql.charAt(i);
            if (c == '\n') {
                if (!continuation) {
                    if (!hash) {
                        endParameter();
                        continue;
                    }
                    hash = false;
                    quote = false;
                    continuation = false;
                }
                wasNewline = true;
                continue;
            } else if (hash) {
                continue;
            }
            if (continuation) {
                if (wasNewline && c == '\\') {
                    wasNewline = false;
                    continuation = false;
                    continue;
                } else if (Character.isWhitespace(c)) {
                    wasNewline = false;
                    continue;
                }
            }
            continuation = wasNewline = false;
            if (quote) {
                text();
                nonEmpty = true;
                if (c == '\\' && i < ql.length() - 1) {
                    char c2 = ql.charAt(i + 1);
                    switch (c2) {
                        case '"':
                            quote = false;
                            accumulateWith('"');
                            i++;
                            continue;
                        case '\n':
                            accumulate();
                            i++;
                            wasNewline = true;
                            continuation = true;
                            continue;
                        case 't': c2 = '\t'; break;
                        case 'n': c2 = '\n'; break;
                        case 'b': c2 = '\b'; break;
                        default:
                            break;
                    }
                    accumulateWith(c2);
                    i++;
                    continue;
                } else if (c == '"') {
                    accumulate();
                    quote = false;
                }
                continue;
            }
            if (c == '#') {
                hash = true;
                accumulate();
                continue;
            } else if (c == '"') {
                quote = true;
            } else if (c == '\\') {
                if (i < ql.length()) {
                    char c2 = ql.charAt(i + 1);
                    switch (c2) {
                        case '\n':
                            accumulate();
                            continuation = true;
                            continue;
                        case 'r': c2 = '\r'; break;
                        case 't': c2 = '\t'; break;
                        case 'b': c2 = '\b'; break;
                    }
                    accumulateWith(c2);
                    i++;
                }
            } else if (Character.isWhitespace(c)) {
                endParameter();
            } else {
                text();
            }
        }
        endParameter();
        return res;
    }
    
}
