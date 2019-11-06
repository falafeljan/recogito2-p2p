# We need JDK 8 and SBT 1.0.x
FROM hseeberger/scala-sbt:8u151-2.12.4-1.0.4 AS build

# <https://github.com/Wadjetz/scala-sbt-nodejs/blob/master/Dockerfile>
RUN curl -sL https://deb.nodesource.com/setup_10.x | bash - && \
    apt install -y nodejs libvips-tools && \
    apt-get clean

RUN mkdir -p /usr/share/recogito
WORKDIR /usr/share/recogito

# install sbt dependencies
ADD project ./project
ADD build.sbt webpack.sbt ./
# We expect one failure due to jai_core being wrongly resolved
RUN sbt update; exit 0
RUN sbt update

# install frontend build tools
ADD ./package.json ./package-lock.json ./
RUN npm install -g webpack webpack-cli
RUN npm ci

# add codebase, compile
COPY ./ ./
RUN sbt compile

# create distribution artifacts
RUN sbt dist
RUN unzip target/universal/recogito2-2.2.zip -d /opt/

# --- end of build stage ---
FROM openjdk:8-jre

RUN apt-get update && \
    apt-get install -y libvips-tools && \
    apt-get clean

# fetch distribution artifacts
COPY --from=build /opt/recogito2-2.2/ /opt/recogito/
WORKDIR /opt/recogito/

# TODO
# * you want to mount a configuration in /opt/recogito/conf/application.conf
# * for production use, you also want to mount the relevant upload directory
#   for persistance - by default that would be /opt/recogito/uploads
#   though it is configurable in application.conf

EXPOSE 9000
CMD ["/opt/recogito/bin/recogito2"]
