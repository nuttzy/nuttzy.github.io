/*

to do:
* unit tests never hurt anyone
* perhaps a dictionary for at least sprint vs mvf language
* document dependent libs (jquery, jqueryui, momentjs)

DONE!
* note that the script doesn't deal with any auth other than a wide-open privs (fine for private VPN)

*/

SprintHealthWidget.config = {
    "widgetEnabled": false,
    "oauthHost":"http://dvbgammonvm01:8008",
    "jiraHost":"http://jira",
    "imgPath":"https://nuttzy.github.io/content/images/",
    "jsErrorsToDialog": false,
    "treLaLaCompatiabilityMode": false,
    "rapidBoardUrl" : "/projects/JiraOAuth/web/rapidboard?jsonp-callback=?&rapidboardId=RAPIDID",
    "burndownUrl"   : "/projects/JiraOAuth/web/burndown?jsonp-callback=?&rapidboardId=RAPIDID&sprintId=SPRINTID"
}



/*
 * boot strapper
 */

function SprintHealthWidget( divId, rapidboardId, sprintId) {
    this.divId = divId;
    this.rapidboardId = rapidboardId;
    this.sprintId = sprintId;
    this.startTime = null;
    this.endTime = null;
    this.markup = null;
}


var sprintHealthWidgetIsBootStrapped = false;
var sprintHealthCheckedOAuthConnection = false ;

var sprintHealthErrorDialog = null;
var sprintHealthHelpDialog = null;
var sprintHealthOAuthDialog = null;
function sprintHealthWidgetBootStrapper( divId, rapidboardId, sprintId) {
    if (SprintHealthWidget.config.widgetEnabled != true) {
        AJS.$("#" + divId).html("* The MVF Status tool is currently offline. View <a href=\"http://jira/secure/Dashboard.jspa?selectPageId=15463\" target=\"_blank\">MVF's in-flight</a>.");
        return ;
    }

    // only want to do these things once per page load
    if (!sprintHealthWidgetIsBootStrapped) {
        sprintHealthWidgetIsBootStrapped = true;
        if (getParameterByName('overrideHealthWidgetJsErrorToDialog')) {
            SprintHealthWidget.config.jsErrorsToDialog = true;
        }
        sprintHealthErrorDialog = new SprintHealthDialogFactory('error') ;
        sprintHealthErrorDialog.create();
        sprintHealthHelpDialog = new SprintHealthDialogFactory('help');
        sprintHealthHelpDialog.create();
        sprintHealthOAuthDialog = new SprintHealthDialogFactory('oauth');
        sprintHealthOAuthDialog.create();
    }

    var sprintHealthWidget = new SprintHealthWidget(divId, rapidboardId, sprintId);
    sprintHealthWidget.markup = new SprintHealthMarkup(sprintId, rapidboardId);

//CN - this is not a great system.  Should have a polling mechanism so that no mvfstats are fired until the connection has been 
//      established and only one attempt is made at establishing the connection
    if (sprintHealthCheckedOAuthConnection) {
        sprintHealthWidget.getMvfStats();
    } else {
        sprintHealthWidget.establishOAuthConnection();
    }
}

SprintHealthWidget.prototype.establishOAuthConnection = function() {
    var self = this;
    // after a 5 second delay, reveal a link where they can reset their session if things are not loading
//    AJS.$("#" + this.divId).html('<span class="oauthreauth">If content fails to load, try to <a class="oauthreset" href="#">authorize</a> again.</span><br/>' + this.markup.getWidgetLoader());
    AJS.$("#" + this.divId).html('<span class="oauthreauth">The MVF Health Widget is back! If content fails to load, try to <a class="oauthreset" href="#">authorize</a> again.</span><br/>' + this.markup.getWidgetLoader());
    AJS.$("span.oauthreauth").hide();
    AJS.$("span.oauthreauth").delay(5000).show(0);
    AJS.$('a.oauthreset').click(function(event) {
        event.preventDefault();
        self.setupOAuthDialog(SprintHealthWidget.config.oauthHost + '/projects/JiraOAuth/web/resetandconnect');
    });

    // see if we can do a simple pull, meaning the user is authorized already
    try {
        AJS.$.getJSON(SprintHealthWidget.config.oauthHost + '/projects/JiraOAuth/web/priorities?jsonp-callback=?', function(results) {
            sprintHealthCheckedOAuthConnection = true;
//CN - when there are multiple widgets loading, they all seem to get kicked off on success. I kinda know why, but seems fragile
            self.getMvfStats();
        })
//CN this never gets called in production since errors always go to the catch - ah, because .error was introduced in 1.5 and removed in 1.8, wiki is running 1.4.2
/*
        // not authorized, so open dialog that will show them to the promised land
        .error(function(parsedResponse,statusText,jqXhr) {
            self.setupOAuthDialog(SprintHealthWidget.config.oauthHost + '/projects/JiraOAuth/web/connect');
        });
*/
    } catch(err) {
//CN - why does a successful getJSON call also end up in here? - most likely due to the wiki using jQuery 1.4.2
        // on production, there is some weird situation where even a successful connection check will fail.  But if we delay 5 secs for the 
        //  connection check to finish, we can know if it's okay to skip authorizing again.
        var self = this;
        setTimeout(function() {
            self.setupOAuthDialog(SprintHealthWidget.config.oauthHost + '/projects/JiraOAuth/web/connect');
        }, 5000);
    }
}

SprintHealthWidget.prototype.setupOAuthDialog = function( iframeSource) {
    if (sprintHealthCheckedOAuthConnection) {
        return;
    }


    var self = this;
    AJS.$("#dialog-mvf-health-tracker-oauth p span.oauth-content").html('<p>Please click <strong>Allow</strong> in the iframe below. Doing so will authorize secure Jira access to view MVF Health.  You might be asked to login first.</p><iframe src="' + iframeSource + '" style="width:100%;height:450px;"></iframe>');
//CN - this is failing b/c the wiki is running 1.4.2 and "on" is a 1.7 feature
    try {
        AJS.$('#dialog-mvf-health-tracker-oauth').on( "dialogclose", function( event, ui ) { self.getMvfStats();} );
    } catch(err) {
        AJS.$("#" + this.divId).html('<span class="oauthrefresh">After authorizing, please refresh the page to see the MVF Health Widget.</span><br/>');
    }
    if (SprintHealthWidget.config.treLaLaCompatiabilityMode) {
        $('#dialog-mvf-health-tracker-oauth').dialog('open');
    } else {
        AJS.$('#dialog-mvf-health-tracker-oauth').dialog('open');
    }
}

SprintHealthWidget.prototype.getMvfStats = function() {
    AJS.$("#" + this.divId).html(this.markup.getWidgetLoader());
    var self = this;
    AJS.$.getJSON(self.getUrl('rapidBoard'), function(results) {
        if (!self.processRapidboardData(results)) {
            // NOTE: the sprintId can be gotten simply by looking in the URL of the burndown chart
            if (self.sprintId == undefined || !self.sprintId) {
                self.handleClosedSprint() ;
                return;
            }
            AJS.$.getJSON(self.getUrl('burndownUrl'), function(results) {
                self.startTime = new SprintHealthDate(results.startTime);
                self.endTime = new SprintHealthDate(results.completeTime);

                self.addMarkup('complete');
                self.processBurndownData(results);
            });    
        }
    });
}



/*
 * process data
 */

SprintHealthWidget.prototype.processRapidboardData = function(result) {
    if (result.sprintsData.sprints.length == 0) {
        return false;
    }
    this.sprintId = result.sprintsData.sprints[0].id;
//CN - accommodate different date formats? 
    this.startTime = new SprintHealthDate(result.sprintsData.sprints[0].startDate);
    this.endTime = new SprintHealthDate(result.sprintsData.sprints[0].endDate);
    
    this.addMarkup('active');
    var self = this;
    AJS.$.getJSON(self.getUrl('burndownUrl'), function(results) {
        self.processBurndownData(results)
    });

    var pointsAnalysis = 0;
    var pointsImplementation = 0;
    var pointsVerification = 0;
    var pointsReleaseReady = 0;
    var totalPoints = 0 ;
    AJS.$.each(result.issuesData.issues, function(i, field){
        if ((field.typeName == "Story") || (field.typeName == "Task") || (field.typeName == "Investigate") || (field.typeName == "Improvement") || 
            (field.typeName == "Feature Request") || (field.typeName == "Bug")) {
            var points = (isNaN(parseInt(field.estimateStatistic.statFieldValue.value))) ? 0 : parseInt(field.estimateStatistic.statFieldValue.value);
            switch (field.statusName) {
            case "Open":
            case "Reopened":
            case "Design":
                pointsAnalysis = pointsAnalysis + points;
                break;
            case "In Progress":
            case "Implementation Parking Lot":
            case "Implementation Complete":
                pointsImplementation = pointsImplementation + points;
                break;
            case "Verification":
            case "Verification Parking Lot":
            case "Verification Complete":
                pointsVerification = pointsVerification + points;
                break;
            case "Resolved":
            case "Closed":
                pointsReleaseReady = pointsReleaseReady + points;
                break;
            default:
                // if we don't know what it is, throw it into 'Analysis'
                pointsAnalysis = pointsAnalysis + points;
            }
            
            totalPoints = totalPoints + points;
        }
    });
    AJS.$("#" + this.divId + " li.AnalysisComplete a b").html(pointsAnalysis);
    AJS.$("#" + this.divId + " li.Implementation a b").html(pointsImplementation);
    AJS.$("#" + this.divId + " li.Verification a b").html(pointsVerification);
    AJS.$("#" + this.divId + " li.ReleaseReady a b").html(pointsReleaseReady);

    if (totalPoints != 0) {
        AJS.$("#" + this.divId + " li.AnalysisComplete").css("width",pointsAnalysis/totalPoints*100 + "%");
        AJS.$("#" + this.divId + " li.Implementation").css("width",pointsImplementation/totalPoints*100 + "%");
        AJS.$("#" + this.divId + " li.Verification").css("width",pointsVerification/totalPoints*100 + "%");
        AJS.$("#" + this.divId + " li.ReleaseReady").css("width",pointsReleaseReady/totalPoints*100 + "%");
    }
    AJS.$("#" + this.divId + " div.UdwFooterContainer div.WorkComplete div.UdwPercentValue").html(Math.round(pointsReleaseReady/totalPoints*100) + "%");            

    var daysRemaining = moment(this.endTime.getYearFirstDate()).diff(moment(),'days') ;
    if (daysRemaining >= 0) {
        AJS.$("#" + this.divId + " div.UdwHeaderContainer span.DaysLeft").html(daysRemaining + " days left");
    } else {
        AJS.$("#" + this.divId + " div.UdwHeaderContainer span.DaysLeft").addClass("overdue");
        AJS.$("#" + this.divId + " div.UdwHeaderContainer span.DaysLeft").html(-daysRemaining + " days overdue");
    }
    var totalDays = moment(this.endTime.getYearFirstDate()).diff(moment(this.startTime.getYearFirstDate()),'days');
    var daysElapsed = moment().diff(this.startTime.getYearFirstDate(),'days') ;
    AJS.$("#" + this.divId + " div.UdwFooterContainer div.TimeElapsed div.UdwPercentValue").html(Math.round(daysElapsed/totalDays*100) + "%");            

    return true;
}

SprintHealthWidget.prototype.processBurndownData = function(result) {
    var startTime = result.startTime;
    var originalScope = 0;
    var endScope = 0;
    var stories = [] ;
    var keys = [] ;
    var delta = 0;
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
            // handle change in scope: we are expecting both a new and old value to be present, otherwise not sure what this!
            } else if (typeof field[0].statC.oldValue != 'undefined') {
                delta = stories[keys.indexOf(field[0].key)].points - field[0].statC.oldValue ;
                endScope = endScope + delta ;                        
                stories[keys.indexOf(field[0].key)].points = field[0].statC.newValue;            
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
            }
        }
        
        if (changeTime <= startTime) {
            endScope = originalScope;
        }
    });
    AJS.$("#" + this.divId + " div.UdwFooterContainer div.PlannedUnits div.UdwPercentValue").html(originalScope);            
    AJS.$("#" + this.divId + " div.UdwFooterContainer div.RevisedUnits div.UdwPercentValue").html(endScope);            
    
    if (endScope!=0) {
        AJS.$("#" + this.divId + " div.UdwFooterContainer div.ScopeChange div.UdwPercentValue").html(Math.round((endScope-originalScope)/endScope*100) + "%");            
    // handle divide by zero
    } else {
        AJS.$("#" + this.divId + " div.UdwFooterContainer div.ScopeChange div.UdwPercentValue").html("0%");            
    }
    
    var startDate = moment(result.startTime).format('20YY-MM-DD');
    // note: if the MVF has not completed yet, then result.completeTime is undefined and moment() will act on the current time
    var targetDate = moment(result.completeTime).format('20YY-MM-DD');
    var weeksToComplete = Math.round(moment(targetDate).diff(moment(startDate),'days')/7*10)/10;
    var perWeek = Math.round(endScope / weeksToComplete * 10)/10 ;
    AJS.$("#" + this.divId + " div.UdwHeaderContainer span.PointsPerWeek").html('(' + perWeek + '/wk)');
}



/*
 * display data
 */

SprintHealthWidget.prototype.addMarkup = function(type) {
    this.markup.sprintId = this.sprintId;
    this.markup.startTime = this.startTime;
    this.markup.endTime = this.endTime;
    if (type == 'complete') {
        AJS.$("#" + this.divId + "").html( this.markup.getHeaderHtml() + '<br/>' +  this.markup.getCompletedFooterHtml() );
        AJS.$("#" + this.divId + " div.UdwHeaderContainer div.DurationDates span.TargetLabel").html("End");
        var weeksToComplete = Math.round(moment(this.endTime.getYearFirstDate()).diff(moment(this.startTime.getYearFirstDate()),'days')/7*10)/10;
        AJS.$("#" + this.divId + " div.UdwHeaderContainer span.DaysLeft").html( weeksToComplete + ' weeks to complete');
    } else {
        AJS.$("#" + this.divId + "").html( this.markup.getHeaderHtml() + this.markup.getProgressBarHtml() + this.markup.getActiveFooterHtml());
    }
    AJS.$("#" + this.divId + " div.UdwHeaderContainer div.DurationDates span.DurationStart").html(this.startTime.getMonthFirstDate());
    AJS.$("#" + this.divId + " div.UdwHeaderContainer div.DurationDates span.DurationTarget").html(this.endTime.getMonthFirstDate());

    sprintHealthHelpDialog.bind('div.UdwFooterContainer a.info');
}



/*
 * error handling
 */

SprintHealthWidget.prototype.handleClosedSprint = function() {
    AJS.$("#" + this.divId).html('The MVF has been completed.  Be sure to add a sprintId parameter to the sprintHealthWidgetBootStrapper call [ex. sprintHealthWidgetBootStrapper(divId, rapidboardId, sprintId) ].  The sprintId can be obtained from the URL of the burndown report for the MVF.');
}

SprintHealthWidget.prototype.handleErrorMessage = function(errorMessage) {
    console.log("Health Widget: " + errorMessage);
    if (SprintHealthWidget.config.jsErrorsToDialog) {
        AJS.$("#dialog-mvf-health-tracker-error p span.error-content").html( errorMessage);
        AJS.$('#dialog-mvf-health-tracker-error').dialog('open');
    }
}




/*
 * Utils
 */

SprintHealthWidget.prototype.getUrl = function(urlType) {
    var url = SprintHealthWidget.config.burndownUrl;
    if (urlType == 'rapidBoard') {
         url = SprintHealthWidget.config.rapidBoardUrl ;
    }
    url = url.replace("RAPIDID", this.rapidboardId) ;
    url = url.replace("SPRINTID", this.sprintId) ;
    return SprintHealthWidget.config.oauthHost + url ;
}

// used in bootstrap before SprintHealthWidget is created
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
function SprintHealthMarkup( sprintId, rapidboardId) {
    this.sprintId = sprintId;
    this.rapidboardId = rapidboardId;
    this.startTime = null;
    this.endTime = null;
}

SprintHealthMarkup.prototype.getWidgetLoader = function() {
    return '<img src="' + SprintHealthWidget.config.imgPath + 'ajax-loader.gif"> Fetching stats from Jira...';
}

SprintHealthMarkup.prototype.getHeaderHtml = function() {
    return '\
        <div class="UdwHeaderContainer"> \
            <div class="DurationElapsed"> \
                <span class="DaysLeft">0 days left</span><span class="PointsPerWeek"></span> \
            </div> \
            <div class="DurationDates"> \
                <span class="DurationLabel">Start:</span><span class="DurationStart DurationValue">2014-01-01</span> <span class="DurationLabel TargetLabel">Target:</span><span class="DurationTarget DurationValue">2014-02-01</span> \
            </div> \
        </div> \
     ';
}

SprintHealthMarkup.prototype.getProgressBarHtml = function() {
    return '\
        <div class="UdwColumnProgressContainer"> \
            <ul class="UdwColumnProgress"> \
                <li class="UdwProgress AnalysisComplete" style="width:25%"> \
                    <a title="Analysis Complete" href="' + SprintHealthWidget.config.jiraHost + '/issues/?jql=status%20in%20%28%22Reopened%22%2C%22Open%22%29%20AND%20Sprint%20%3D%20' + this.sprintId + '" target="_blank" class="UdwProgressStatusInfo"> \
                        <b>0</b> \
                    </a> \
                </li> \
                <li class="UdwProgress Implementation" style="width:25%"> \
                    <a title="Implementation" href="' + SprintHealthWidget.config.jiraHost + '/issues/?jql=status%20in%20%28%22Implementation%20Parking%20Lot%22%2C%22In%20Progress%22%29%20AND%20Sprint%20%3D%20' + this.sprintId + '" target="_blank" class="UdwProgressStatusInfo"> \
                        <b>0</b> \
                    </a> \
                </li> \
                <li class="UdwProgress Verification" style="width:25%"> \
                    <a title="Verification" href="' + SprintHealthWidget.config.jiraHost + '/issues/?jql=status%20in%20%28%22Verification%20Parking%20Lot%22%2C%22Verification%22%29%20AND%20Sprint%20%3D%20' + this.sprintId + '" target="_blank" class="UdwProgressStatusInfo"> \
                        <b>0</b> \
                    </a> \
                </li> \
                <li class="UdwProgress ReleaseReady" style="width:25%; text-align:bottom;"> \
                    <a title="Release Ready" href="' + SprintHealthWidget.config.jiraHost + '/secure/IssueNavigator.jspa?reset=true&jqlQuery=status%20in%20(%22Closed%22,%22Resolved%22)%20AND%20Sprint%20=%20' + this.sprintId + '" target="_blank" class="UdwProgressStatusInfo"> \
                        <b>0</b> \
                    </a> \
                </li> \
            </ul> \
        </div> \
    ';
}

SprintHealthMarkup.prototype.getActiveFooterHtml = function() {
    return '\
        <div class="UdwFooterContainer"> \
            <div class="UdwPercentUpdatesContainer"> \
                <div class="PercentContainer TimeElapsed"> \
                    <div class="UdwPercentValue">0%</div> \
                    <div class="UdwPercentLabel">Time Elapsed</div> \
                </div> \
                <div class="PercentContainer WorkComplete"> \
                    <div class="UdwPercentValue">0%</div> \
                    <div class="UdwPercentLabel">Work Complete</div> \
                </div> \
                <div class="PercentContainer ScopeChange"> \
                    <div class="UdwPercentValue"><img src="' + SprintHealthWidget.config.imgPath + 'ajax-loader.gif"></div> \
                    <div class="UdwPercentLabel">Scope Change</div> \
                </div> \
            </div> \
            <div class="UdwNavContainer"> \
                <div><a target="_blank" href="' + SprintHealthWidget.config.jiraHost + '/secure/RapidBoard.jspa?rapidView=' + this.rapidboardId + '">Kanban</a> | <a target="_blank" href="' + SprintHealthWidget.config.jiraHost + '/secure/RapidBoard.jspa?rapidView=' + this.rapidboardId + '&view=reporting&chart=burndownChart">Burndown</a> | <a target="_blank" href="' + SprintHealthWidget.config.jiraHost + '/secure/RapidBoard.jspa?rapidView=' + this.rapidboardId + '&view=reporting&chart=cumulativeFlowDiagram&from=' + this.startTime.getYearFirstDate() + '&to=' + this.endTime.getYearFirstDate() + '">CFD</a> | <a class="info" href="#"><img class="infoImage" alt="More Info" title="More Info" src="' + SprintHealthWidget.config.imgPath + 'info.png"></a></div> \
            </div> \
        </div> \
    ';
}

SprintHealthMarkup.prototype.getCompletedFooterHtml = function() {
    return '\
        <div class="UdwFooterContainer"> \
            <div class="UdwPercentUpdatesContainer"> \
                <div class="PercentContainer PlannedUnits"> \
                    <div class="UdwPercentValue">0</div> \
                    <div class="UdwPercentLabel">Planned Units</div> \
                </div> \
                <div class="PercentContainer RevisedUnits"> \
                    <div class="UdwPercentValue">0</div> \
                    <div class="UdwPercentLabel">Revised Units</div> \
                </div> \
                <div class="PercentContainer ScopeChange"> \
                    <div class="UdwPercentValue"><img src="' + SprintHealthWidget.config.imgPath + 'ajax-loader.gif"></div> \
                    <div class="UdwPercentLabel">Scope Change</div> \
                </div> \
            </div> \
            <div class="UdwNavContainer"> \
                <div><a target="_blank" href="' + SprintHealthWidget.config.jiraHost + '/secure/RapidBoard.jspa?rapidView=' + this.rapidboardId + '&view=reporting&chart=controlChart&from=' + this.startTime.getYearFirstDate() + '&to=' + this.endTime.getYearFirstDate() + '">Control</a> | <a target="_blank" href="' + SprintHealthWidget.config.jiraHost + '/secure/RapidBoard.jspa?rapidView=' + this.rapidboardId + '&view=reporting&chart=burndownChart">Burndown</a> | <a target="_blank" href="' + SprintHealthWidget.config.jiraHost + '/secure/RapidBoard.jspa?rapidView=' + this.rapidboardId + '&view=reporting&chart=cumulativeFlowDiagram&from=' + this.startTime.getYearFirstDate() + '&to=' + this.endTime.getYearFirstDate() + '">CFD</a> | <a class="info" href="#"><img class="infoImage" alt="More Info" title="More Info" src="' + SprintHealthWidget.config.imgPath + 'info.png"></a></div> \
            </div> \
        </div> \
    ';
}


/*
 * Dialogs
 */

function SprintHealthDialogFactory(dialogDivId) {
    this.dialogDivId = 'dialog-mvf-health-tracker-' + dialogDivId;
    this.title = "";
    this.dialogContents = "";
    this.height = undefined;
    this.width = undefined;
}

SprintHealthDialogFactory.prototype.create = function() {
    if (this.dialogDivId == 'dialog-mvf-health-tracker-help') {
        this.title = 'Sprint Metrics';
        this.dialogContents = getHelpDialogMarkup();
        this.height = 450;
        this.width = 600;
    } else if (this.dialogDivId == 'dialog-mvf-health-tracker-oauth') {
        this.title = 'Authorize Jira Access';
        this.dialogContents = getOAuthDialogMarkup();
        this.width = 800;
        this.height = 650;
    } else {
        this.title = 'Error';
        this.dialogContents = getErrorDialogMarkup();
        this.width = 300;
        this.height = 450;
    }

    AJS.$('<div id="' + this.dialogDivId + '"></div>').appendTo('body');
    AJS.$('#' + this.dialogDivId).attr("title", this.title);
    AJS.$('#' + this.dialogDivId).html( this.dialogContents);

    var dialogConfig = {
        height: this.height,
        width: this.width,
        modal: true,
        autoOpen: false,
        buttons: {
            Ok: function(event) {
                AJS.$( this ).dialog( "close" );
            }
        }
    };

    var self = this;
    if (this.dialogDivId == 'dialog-mvf-health-tracker-help') {
        try {
//CN - caused breakage on production!!!
//            AJS.$(function() { AJS.$( '#' + self.dialogDivId).dialog( dialogConfig);});
            AJS.$(function() { $( '#' + self.dialogDivId).dialog( dialogConfig);});
        // jQuery UI 1.8.17 has a bug preventing dialog buttons from working.  I should detect if the error condition is present and retry
        } catch(err) {
            dialogConfig.buttons = {} ;
            AJS.$(function() { AJS.$( '#' + self.dialogDivId).dialog(dialogConfig);});
        }
    } else {
        try {
            AJS.$('#' + this.dialogDivId).dialog( dialogConfig);
        } catch(err) {
            dialogConfig.buttons = {} ;
            if (SprintHealthWidget.config.treLaLaCompatiabilityMode) {
                AJS.$(function() { $( '#' + self.dialogDivId).dialog( dialogConfig);});
            } else {
                AJS.$('#' + this.dialogDivId).dialog( dialogConfig);
            }
        }
    }
}

SprintHealthDialogFactory.prototype.bind = function(selector) {
    var self = this;
    AJS.$(selector).click(function(event) {
        event.preventDefault();
//CN - not sure why there's a conflict when tre-la-la is present, but this fixes it
        if (SprintHealthWidget.config.treLaLaCompatiabilityMode) {
            $('#' + self.dialogDivId).dialog('open');
        } else {
            AJS.$('#' + self.dialogDivId).dialog('open');
        }
    });
}

function getErrorDialogMarkup() {
    return '\
        <p> \
            <span class="ui-icon ui-icon-circle-minus"></span> \
            <span class="error-content">Now you have gone and done it</span> \
        </p>';
}

function getOAuthDialogMarkup() {
    return '\
        <p> \
            <span class="oauth-content">OAuth</span> \
        </p>';
}

function getHelpDialogMarkup() {
    return '\
        <h3>Header</h3> \
        <p> \
            <span class="ui-icon ui-icon-circle-minus"></span> \
            <strong>Days Left:</strong> The number of days remaining, including weekends. \
        </p> \
        <p> \
            <span class="ui-icon ui-icon-circle-minus"></span> \
            <strong>Story Units per Week:</strong> To the right of the days remaining, the number of story units moved to Release Ready divided by the number of weeks elapsed.  \
        </p> \
        <p> \
            <span class="ui-icon ui-icon-circle-minus"></span> \
            <strong>Weeks to Complete:</strong> (completed MVFs only) The number of weeks elapsed to complete the MVF.  There is no allowance made for weekends or non-working days. \
        </p> \
        <p> \
            <span class="ui-icon ui-icon-circle-minus"></span> \
            <strong>Start:</strong> The day the MVF began as determined by clicking the "Start Sprint" button on the planning page. \
        </p> \
        <p> \
            <span class="ui-icon ui-icon-circle-minus"></span> \
            <strong>End/Target Date:</strong> The date the MVF will (or did) complete.  This value can be adjusted on the MVFs Kanban page. \
        </p> \
        <h3>Progress Bar</h3> \
        <p> \
            <span class="ui-icon ui-icon-circle-minus"></span> \
            For an active MVF, the four Lean columns of Analysis Complete, Implementation, Verification, and Release Ready are represented.  The bars grow proportionally \
            to the number of story units in each column.  If a column currently contains no stories, it will not be drawn on the progress tracker.  The number of story \
            units is displayed for each column.  Clicking the progress bar will open a list of stories and subtaks currently assigned to that column. \
        </p> \
        <h3>Footer</h3> \
        <p> \
            <span class="ui-icon ui-icon-circle-minus"></span> \
            <strong>Time Elapsed:</strong> Percentage of days gone by, including non-working days, of the MVF duration. \
        </p> \
        <p> \
            <span class="ui-icon ui-icon-circle-minus"></span> \
            <strong>Work Complete:</strong> The percentage of story units moved to Release Ready. \
        </p> \
        <p> \
            <span class="ui-icon ui-icon-circle-minus"></span> \
            <strong>Scope Change:</strong> The planned number of story points at the MVF start is determined.  It is the subtracted from the final total of story units remaining \
            in the sprint.  Lastly, the difference is divided by the original planned number to yield a percentage.  A negative percentage indicates that the net scope of \
            the MVF has descreased since the originally planned value. \
        </p> \
        <p> \
            <span class="ui-icon ui-icon-circle-minus"></span> \
            <strong>Planned Units:</strong> (completed MVFs only) The number of story units that were originally planned at the start of the MVF. \
        </p> \
        <p> \
            <span class="ui-icon ui-icon-circle-minus"></span> \
            <strong>Revised Units:</strong> (completed MVFs only) The final number of story units that were completed in the MVF. \
        </p>' ;
}
