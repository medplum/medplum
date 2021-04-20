import React from 'react';

interface PersonNameProps {
    name?: string
}

export class PersonName extends React.Component<PersonNameProps, {}> {
    private readonly display: string;

    constructor(props: PersonNameProps) {
        super(props);

        let parts = (props.name || '').split('^');
        this.display = parts.length === 0 ? '' :
                       parts.length === 1 ? parts[0] :
                       parts[1] + ' ' + parts[0];
    }

    render() {
        return <span>{this.display}</span>;
    }
}
