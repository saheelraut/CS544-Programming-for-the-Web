//-*- mode: rjsx-mode;

import React from 'react';
import ReactDom from 'react-dom';

/** Component which displays a single input widget having the following
 *  props:
 *
 *    `id`:     The id associated with the <input> element.
 *    `value`:  An initial value for the widget (defaults to '').
 *    `label`:  The label displayed for the widget.
 *    `update`: A handler called with the `value` of the <input>
 *              widget whenever it is blurred or its containing
 *              form submitted.
 */
export default class SingleInput extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            value: this.props.value,
            error: ''
        };
        this.handleChange = this.handleChange.bind(this);
    }

    handleChange(event) {
        this.setState({value: event.target.value});
        event.preventDefault();
    }

    render() {
        return (
            <form onSubmit={this.handleChange}>
                <label>
                    <span>Open SpreadSheet Name</span>
                </label>
                <input type="text" id ={this.props.id} value={this.state.value} onChange={this.handleChange}/>
                <span className = "error">
                    Spreadsheet name must contain one or more alphanumerics, hyphen or space characters.
                </span>

            </form>
        );
    }

}
