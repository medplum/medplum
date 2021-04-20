
import { SearchDefinition, SearchResponse } from 'medplum';

export class SearchChangeEvent extends Event {
    readonly definition: SearchDefinition;

    constructor(definition: SearchDefinition) {
        super('change');
        this.definition = definition;
    }
}

export class SearchLoadEvent extends Event {
    readonly response: SearchResponse;

    constructor(response: SearchResponse) {
        super('load');
        this.response = response;
    }
}

export class SearchClickEvent extends Event {
    readonly resourceId: string;
    readonly browserEvent: React.MouseEvent;

    constructor(resourceId: string, browserEvent: React.MouseEvent) {
        super('click');
        this.resourceId = resourceId;
        this.browserEvent = browserEvent;
    }
}
