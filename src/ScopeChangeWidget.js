/*

to do:
* unit tests never hurt anyone
* perhaps a dictionary for at least sprint vs mvf language
* document dependent libs (jquery, jqueryui, momentjs)

* note that the script doesn't deal with any auth other than a wide-open privs (fine for private VPN)

*/

ScopeChangeWidget.config = {
    "jiraHost":"http://jira",
    "imgPath":"https://nuttzy.github.io/content/images/",
    "jsErrorsToDialog": false,
    "issueLookupUrl" : "/rest/api/2/issue/ISSUEKEY?jsonp-callback=?",
    "burndownUrl"    : "/rest/greenhopper/1.0/rapid/charts/scopechangeburndownchart.json?rapidViewId=RAPIDID&sprintId=SPRINTID&jsonp-callback=?"
}



/*
 * boot strapper
 */

function ScopeChangeWidget( divId, rapidboardId, sprintId) {
    this.divId = divId;
    this.rapidboardId = rapidboardId;
    this.sprintId = sprintId;
    this.startTime = null;
    this.endTime = null;
    this.markup = null;
}

function scopeChangeWidgetBootStrapper( divId, rapidboardId, sprintId) {
    var scopeChangeWidget = new ScopeChangeWidget(divId, rapidboardId, sprintId);
    scopeChangeWidget.markup = new ScopeChangeMarkup(sprintId, rapidboardId);
    scopeChangeWidget.getScopeChange();
}


ScopeChangeWidget.prototype.getScopeChange = function() {
    AJS.$("#" + this.divId).html(this.markup.getWidgetLoader());
    var self = this;

    AJS.$.getJSON(self.getUrl('burndownUrl'), function(results) {
        self.startTime = new SprintHealthDate(results.startTime);
        self.endTime = new SprintHealthDate(results.completeTime);

        self.addMarkup();
        self.processBurndownData(results);
    });    
}



/*
 * process data
 */

ScopeChangeWidget.prototype.processBurndownData = function(result) {
    var tableHtml = this.markup.getScopeChangeLedgerHeader() ;
    var affectedKeys = [] ;
    var startTime = result.startTime;
    var originalScope = 0;
    var endScope = 0;
    var stories = [] ;
    var keys = [] ;
    var delta = 0;
    var completedPoints = 0;
    var self = this;
    AJS.$.each(result.changes, function(changeTime, field){
        // determine scope start
        if (typeof field[0].statC != 'undefined' && typeof field[0].statC.newValue != 'undefined' && changeTime <= startTime) {
            // typical case of adding a new story to the sprint before the MVF is kicked off
            if (keys.indexOf(field[0].key) == -1) {
                originalScope = originalScope + field[0].statC.newValue ;
                keys.push(field[0].key) ;
                stories.push({"key":field[0].key,"points":field[0].statC.newValue});
            // odd case of modifying the story points before MVF kicks off
            } else {
                // not sure if this could ever happen, but if it does, I think we want to update the value if it is non-zero
                delta = stories[keys.indexOf(field[0].key)].points - field[0].statC.oldValue ;
                originalScope = originalScope + delta ;                        
                stories[keys.indexOf(field[0].key)].points = field[0].statC.newValue;
            }
        // handles changes after scope start
        } else if (typeof field[0].statC != 'undefined' && typeof field[0].statC.newValue != 'undefined') {
            // handle new story added
            if (keys.indexOf(field[0].key) == -1) {
                endScope = endScope + field[0].statC.newValue ;
                keys.push(field[0].key) ;
                stories.push({"key":field[0].key,"points":field[0].statC.newValue});
                tableHtml += self.markup.getScopeChangeLedgerRow( changeTime, field[0].key,'Try hard ninja','Added to MVF', field[0].statC.newValue);
                affectedKeys.push(field[0].key) ;
            // handle change in scope: we are expecting both a new and old value to be present, otherwise not sure what this!
            } else if (typeof field[0].statC.oldValue != 'undefined') {
                delta = stories[keys.indexOf(field[0].key)].points - field[0].statC.oldValue ;
                endScope = endScope + delta ;                        
                stories[keys.indexOf(field[0].key)].points = field[0].statC.newValue;            
                tableHtml += self.markup.getScopeChangeLedgerRow( changeTime, field[0].key,'Try hard ninja','Weight changed', field[0].statC.newValue - field[0].statC.oldValue);
                affectedKeys.push(field[0].key) ;
            } else {
                self.handleErrorMessage("processBurndownData - unexecpted condition for " + field[0].key);
            }
        // handle case of removing story from sprint
        } else if (typeof field[0].added != 'undefined' && field[0].added === false) {
            // sprint not started
            if (changeTime <= startTime) {
                originalScope = originalScope - stories[keys.indexOf(field[0].key)].points;
                stories[keys.indexOf(field[0].key)].points = 0;                
            // sprint has started
            } else {
                endScope = endScope - stories[keys.indexOf(field[0].key)].points;
                stories[keys.indexOf(field[0].key)].points = 0;                
                tableHtml += self.markup.getScopeChangeLedgerRow( changeTime, field[0].key,'Try hard ninja','Removed from MVF', stories[keys.indexOf(field[0].key)].points);
                affectedKeys.push(field[0].key) ;                
            }
        // tally completed items
        } else if (changeTime >= startTime && typeof field[0].column != 'undefined' && (field[0].column.notDone == false && field[0].column.done == true)) {
//CN - throwing an error on Chandima's sprint b/c it doesn't have this key yet somehow
            completedPoints += stories[keys.indexOf(field[0].key)].points;
        }
        
        if (changeTime <= startTime) {
            endScope = originalScope;
        }
    });
    AJS.$("#" + this.divId + " div.UdwFooterContainer span.PlannedUnits").html(originalScope);
    AJS.$("#" + this.divId + " div.UdwFooterContainer span.RevisedUnits").html(endScope);
    
    if (endScope!=0) {
        AJS.$("#" + this.divId + " div.UdwFooterContainer span.ScopeChange").html(Math.round((endScope-originalScope)/endScope*100) + "%");            
    // handle divide by zero
    } else {
        AJS.$("#" + this.divId + " div.UdwFooterContainer span.ScopeChange").html("0%");            
    }
    
    var startDate = moment(result.startTime).format('20YY-MM-DD');
    // note: if the MVF has not completed yet, then result.completeTime is undefined and moment() will act on the current time
    var targetDate = moment(result.completeTime).format('20YY-MM-DD');    
    var weeksToComplete = Math.round(moment(targetDate).diff(moment(startDate),'days')/7*10)/10;
    var perWeek = Math.round(completedPoints / weeksToComplete * 10)/10 ;
    AJS.$("#" + this.divId + " div.UdwFooterContainer span.PointsPerWeek").html(perWeek);

//CN fix div id
//CN can we have the table extracted elsewhere so we don't have markup here?
    AJS.$("#" + this.divId + " div.scopeChangeLedger").html('<table style="width:100%;">' + tableHtml + '</table>');

    var self = this;
    var key = '';
    for (var i=0; i<affectedKeys.length; i++) {
        AJS.$.getJSON(self.getUrl('issueLookupUrl',affectedKeys[i]), function(results) {
            AJS.$("#" + self.divId + ' div.jiraKey-' + results.key).html(results.fields['summary']);
        });
    }
}


/*
 * display data
 */

ScopeChangeWidget.prototype.addMarkup = function() {
    this.markup.sprintId = this.sprintId;
    this.markup.startTime = this.startTime;
    this.markup.endTime = this.endTime;
    AJS.$("#" + this.divId + "").html( this.markup.getScopeChangeLedgerMarkup() + this.markup.getFooterHtml());
}



/*
 * Utils
 */

ScopeChangeWidget.prototype.getUrl = function(urlType, issueKey) {
    var url = ScopeChangeWidget.config.burndownUrl;
    if (urlType == 'issueLookupUrl') {
        url = ScopeChangeWidget.config.issueLookupUrl ;
        url = url.replace("ISSUEKEY", issueKey);
    }
    url = url.replace("RAPIDID", this.rapidboardId) ;
    url = url.replace("SPRINTID", this.sprintId) ;
    return ScopeChangeWidget.config.jiraHost + url ;
}

// used in bootstrap before ScopeChangeWidget is created
function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}



/*
 * Dates
 */

function SprintHealthDate( time) {
    this.time = time;
}

SprintHealthDate.prototype.getMonthFirstDate = function() {
    return moment(this.time).format('MM/DD/20YY');
}

SprintHealthDate.prototype.getYearFirstDate = function() {
    return moment(this.time).format('20YY-MM-DD');
}



/*
 * markup
 */
function ScopeChangeMarkup( sprintId, rapidboardId) {
    this.sprintId = sprintId;
    this.rapidboardId = rapidboardId;
    this.startTime = null;
    this.endTime = null;
}

ScopeChangeMarkup.prototype.getWidgetLoader = function() {
    return '<img src="' + ScopeChangeWidget.config.imgPath + 'ajax-loader.gif"> Fetching stats from Jira...';
}

ScopeChangeMarkup.prototype.getScopeChangeLedgerMarkup = function() {
    return '\
        <div class="scopeChangeLedger"></div> \
    ';
}

ScopeChangeMarkup.prototype.getScopeChangeLedgerHeader = function() {
    return '\
            <tr> \
                <th>Date</th> \
                <th>Key</th> \
                <th>Summary</th> \
                <th>Event</th> \
                <th>Points</th> \
            </tr>';
}

ScopeChangeMarkup.prototype.getScopeChangeLedgerRow = function(time,key,summary,event,points) {
    return '\
            <tr> \
                <td>' + moment.unix(time/1000).format('MM/DD/20YY') + '</td> \
                <td><a href="' + ScopeChangeWidget.config.jiraHost + '/browse/' + key + '" target="_blank">' + key + '</a></td> \
                <td><div class="jiraKey-' + key + '">...</div></td> \
                <td>' + event + '</td> \
                <td style="text-align:right;padding-right:20px;">' + points + '</td> \
            </tr>';
//                <td>' + moment.unix(time).format('MM/DD/20YY') + '</td> \
}

ScopeChangeMarkup.prototype.getFooterHtml = function() {
    return '\
        <div class="UdwFooterContainer"> \
            <span style="font-weight:bold;padding:5px;">Planned Units:</span><span class="PlannedUnits" style="padding-right:10px;">0</span> \
            <span style="font-weight:bold;padding:5px;">Revised Units:</span><span class="RevisedUnits" style="padding-right:10px;">0</span> \
            <span style="font-weight:bold;padding:5px;">Scope Change:</span><span class="ScopeChange" style="padding-right:10px;">0%</span> \
            <span style="font-weight:bold;padding:5px;">Points/Week:</span><span class="PointsPerWeek" style="padding-right:10px;">0</span> \
        </div>';
}
